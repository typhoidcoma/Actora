import { create } from 'zustand'
import type { ServerFrame } from '../aelora/protocol'
import type { FrameBus } from '../aelora/socket'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'

// "For you": a few fun, personal finds from the web, once a day. Wendy does a
// real web search in a dedicated "Fun finds" conversation so the user's main
// thread stays clean, and replies with a JSON block we turn into cards.

export interface Find {
  id: string
  title: string
  blurb: string
  why: string
  url: string
  image: string | null
  source: string
  tag: string
}

export type FindsStatus = 'idle' | 'hunting' | 'ready' | 'error'

interface FindsState {
  items: Find[]
  status: FindsStatus
  /** Local date (YYYY-MM-DD) the current items were found. */
  day: string | null
  seen: string[]
  /** Streaming text of the current hunt (for the "hunting" shimmer). */
  progress: string
}

const STORE_KEY = 'actora.finds.v1'
const THREAD_KEY = 'actora.finds.thread.v1'
const HUNT_TIMEOUT_MS = 120_000

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function load(): Pick<FindsState, 'items' | 'day' | 'seen'> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Pick<
      FindsState,
      'items' | 'day' | 'seen'
    > | null
    if (raw && Array.isArray(raw.items)) return { items: raw.items, day: raw.day, seen: raw.seen ?? [] }
  } catch {
    /* fall through */
  }
  return { items: [], day: null, seen: [] }
}

function save(s: Pick<FindsState, 'items' | 'day' | 'seen'>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: s.items, day: s.day, seen: s.seen }))
  } catch {
    /* private mode */
  }
}

const initial = load()
export const useFinds = create<FindsState>(() => ({
  ...initial,
  status: initial.items.length ? 'ready' : 'idle',
  progress: '',
}))

/** How many finds the user hasn't looked at yet: the card's hero number. */
export const unseenCount = (s: Pick<FindsState, 'items' | 'seen'>) =>
  s.items.filter((f) => !s.seen.includes(f.id)).length

export function markSeen(id: string): void {
  const s = useFinds.getState()
  if (s.seen.includes(id)) return
  const seen = [...s.seen, id]
  useFinds.setState({ seen })
  save({ ...s, seen })
}

const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\/\S+$/.test(u.trim())

/** Tolerant parse of Wendy's reply: a ```json block, a bare object, or failing that her Markdown links/images. */
export function parseFinds(text: string): Find[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]
  const brace = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  const bracket = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  let list: unknown[] = []
  for (const candidate of [fenced, text.trim(), bracket, brace]) {
    if (!candidate) continue
    try {
      const data = JSON.parse(candidate) as { finds?: unknown } | unknown[]
      list = Array.isArray(data) ? data : Array.isArray(data?.finds) ? data.finds : []
      if (list.length) break
    } catch {
      /* try the next shape */
    }
  }
  const out: Find[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const title = String(r.title ?? '').trim()
    const url = isHttp(r.url) ? String(r.url).trim() : ''
    if (!title || !url || seen.has(url)) continue
    seen.add(url)
    out.push({
      id: `${url}`.slice(0, 200),
      title: title.slice(0, 120),
      blurb: String(r.blurb ?? '')
        .trim()
        .slice(0, 280),
      why: String(r.why ?? '')
        .trim()
        .slice(0, 90),
      url,
      image: isHttp(r.image) ? String(r.image).trim() : null,
      source: String(r.source ?? new URL(url).hostname.replace(/^www\./, '')).slice(0, 40),
      tag: String(r.tag ?? 'Find').slice(0, 16),
    })
    if (out.length === 6) break
  }
  if (out.length) return out

  // Fallback: Markdown links, paired with the nearest preceding image.
  let lastImage: string | null = null
  for (const m of text.matchAll(/!\[[^\]]*]\((https?:[^)\s]+)\)|\[([^\]]+)]\((https?:[^)\s]+)\)/g)) {
    if (m[1]) lastImage = m[1]
    else if (m[2] && m[3] && !seen.has(m[3])) {
      seen.add(m[3])
      out.push({
        id: m[3],
        title: m[2],
        blurb: '',
        why: '',
        url: m[3],
        image: lastImage,
        source: new URL(m[3]).hostname.replace(/^www\./, ''),
        tag: 'Find',
      })
      lastImage = null
    }
  }
  return out.slice(0, 6)
}

export const FIND_DIRECTIVE = `Find me today's fun stuff. Use web search to find 4 fun, light, genuinely interesting things from the web today that I'd personally enjoy, based on what you know about me (my interests, hobbies, where I live, what I'm working on). Mix it up: a good-news story, something nerdy or surprising, something local or seasonal, something visual. For each, include a real image URL from the page (its og:image) and the page URL.
Reply ONLY with a JSON code block in exactly this shape, nothing else:
\`\`\`json
{"finds":[{"title":"short headline","blurb":"one or two fun sentences","why":"why I'll like it, under 70 characters, your voice","url":"https://…","image":"https://…","source":"site name","tag":"Good news|Nerdy|Local|Visual|Weird"}]}
\`\`\``

// ── The hunt: a chat turn in the dedicated thread ───────────────────────────

let bus: FrameBus | null = null
let threadId: string | null = readThread()
let creatingThread = false
let huntTimer: ReturnType<typeof setTimeout> | undefined
let buffer = ''

function readThread(): string | null {
  try {
    return localStorage.getItem(THREAD_KEY)
  } catch {
    return null
  }
}

function writeThread(id: string | null) {
  threadId = id
  try {
    if (id) localStorage.setItem(THREAD_KEY, id)
    else localStorage.removeItem(THREAD_KEY)
  } catch {
    /* private mode */
  }
}

function finish(items: Find[] | null) {
  clearTimeout(huntTimer)
  buffer = ''
  if (!items || !items.length) {
    useFinds.setState({ status: useFinds.getState().items.length ? 'ready' : 'error', progress: '' })
    return
  }
  const next = { items, day: today(), seen: [] as string[] }
  useFinds.setState({ ...next, status: 'ready', progress: '' })
  save(next)
}

function sendHunt() {
  if (!bus || !threadId) return finish(null)
  buffer = ''
  if (!bus.send({ type: 'chat', message: FIND_DIRECTIVE, conversationId: threadId })) finish(null)
}

/** Start a hunt now (the "Find me more" option, or the daily refresh). */
export function hunt(): void {
  if (!bus || useFinds.getState().status === 'hunting') return
  useFinds.setState({ status: 'hunting', progress: '' })
  clearTimeout(huntTimer)
  huntTimer = setTimeout(() => finish(null), HUNT_TIMEOUT_MS)
  if (threadId) return sendHunt()
  // First hunt ever: create the "Fun finds" thread, then hand the socket's
  // active thread back to the user's conversation.
  creatingThread = true
  if (!bus.send({ type: 'conversation.new' })) {
    creatingThread = false
    finish(null)
  }
}

/**
 * Called by the router before the main chat handler. Claims every frame that
 * belongs to the finds thread (and the conversation.created for it), so none of
 * it shows up in the user's conversation.
 */
export function handleFindsFrame(f: ServerFrame): boolean {
  const cid = typeof f.conversationId === 'string' ? f.conversationId : null
  if (f.type === 'conversation.created' && creatingThread && cid) {
    creatingThread = false
    writeThread(cid)
    bus?.send({ type: 'conversation.rename', conversationId: cid, title: 'Fun finds' })
    const main = useAgent.getState().conversationId
    // conversation.new made the finds thread active; switch back (or start a fresh main thread).
    if (main) bus?.send({ type: 'conversation.open', conversationId: main, limit: 40 })
    else bus?.send({ type: 'conversation.new' })
    sendHunt()
    return true
  }
  if (!cid || cid !== threadId) return false
  switch (f.type) {
    case 'token':
      buffer += String(f.delta ?? '')
      useFinds.setState({ progress: buffer.slice(-80) })
      return true
    case 'done':
      finish(parseFinds(String(f.text ?? buffer)))
      return true
    case 'error':
      // The thread may have been deleted: forget it and start a new one next time.
      if (f.code === 'conversation_failed') writeThread(null)
      finish(null)
      return true
    case 'conversation.updated':
    case 'conversation.messages':
      return true
    case 'event':
      return false
    default:
      // chat.start, tool.progress and the like: ours, nothing to render.
      return true
  }
}

/** Wire to the live socket; hunt once a day when the app is connected and loaded. */
export function startFinds(socket: FrameBus): () => void {
  bus = socket
  const maybeHunt = () => {
    const a = useAgent.getState()
    const loaded = Object.values(useEntities.getState().hydrated).every(Boolean)
    const s = useFinds.getState()
    if (a.connection === 'open' && loaded && s.day !== today() && s.status !== 'hunting' && s.status !== 'error') hunt()
  }
  const offA = useAgent.subscribe(maybeHunt)
  const offE = useEntities.subscribe(maybeHunt)
  maybeHunt()
  return () => {
    offA()
    offE()
    clearTimeout(huntTimer)
    if (bus === socket) bus = null
    if (useFinds.getState().status === 'hunting')
      useFinds.setState({ status: useFinds.getState().items.length ? 'ready' : 'idle' })
  }
}
