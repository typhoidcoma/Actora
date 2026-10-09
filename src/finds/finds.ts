import { create } from 'zustand'
import type { ServerFrame } from '../aelora/protocol'
import type { FrameBus } from '../aelora/socket'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'

// "For you": a few fun, personal finds from the web, once a day. Wendy does a
// real web search in a dedicated "Fun finds" conversation so the user's main
// thread stays clean. She replies in normal Markdown (kept as her note) and
// calls the finds.set ui_action with the items, which become the cards.

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

export type FindsStatus = 'idle' | 'hunting' | 'ready' | 'error' | 'unavailable'

interface FindsState {
  items: Find[]
  status: FindsStatus
  /** Local date (YYYY-MM-DD) the current items were found. */
  day: string | null
  seen: string[]
  /** Streaming text of the current hunt (for the "hunting" shimmer). */
  progress: string
  /** Wendy's Markdown reply from the hunt that produced these finds. */
  note: string
}

const STORE_KEY = 'actora.finds.v1'
const THREAD_KEY = 'actora.finds.thread.v1'
const HUNT_TIMEOUT_MS = 120_000

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Everything cached here belongs to one signed-in user. Nothing is shown from
// the cache until hello confirms who that is (adoptFindsUser), so a shared
// device never flashes the previous person's finds or reuses their thread.
let owner: string | null = null

type Saved = Pick<FindsState, 'items' | 'day' | 'seen'> & { note?: string; owner?: string | null }

function load(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Saved | null
    if (raw && Array.isArray(raw.items))
      return { items: raw.items, day: raw.day, seen: raw.seen ?? [], note: raw.note ?? '', owner: raw.owner }
  } catch {
    /* fall through */
  }
  return null
}

function save(s: Pick<FindsState, 'items' | 'day' | 'seen' | 'note'>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: s.items, day: s.day, seen: s.seen, note: s.note, owner }))
  } catch {
    /* private mode */
  }
}

export const useFinds = create<FindsState>(() => ({
  items: [],
  day: null,
  seen: [],
  status: 'idle',
  progress: '',
  note: '',
}))

/** Called on every hello: load this user's cache, or wipe another user's. */
export function adoptFindsUser(userId: string | null): void {
  if (owner === userId) return
  owner = userId
  const saved = load()
  const thread = readThread()
  if (saved && saved.owner === userId) {
    useFinds.setState({
      items: saved.items,
      day: saved.day,
      seen: saved.seen,
      note: saved.note ?? '',
      status: saved.items.length ? 'ready' : 'idle',
    })
  } else {
    useFinds.setState({ items: [], day: null, seen: [], status: 'idle', progress: '', note: '' })
    try {
      localStorage.removeItem(STORE_KEY)
    } catch {
      /* private mode */
    }
  }
  threadId = thread && thread.owner === userId ? thread.id : null
  if (!threadId) writeThread(null)
}

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

/**
 * Validates finds from anywhere (finds.set args, or a parsed reply): needs a
 * title and an http(s) url; caps every field (the server passes args through
 * unchecked); drops duplicates; at most six.
 */
export function cleanFinds(list: unknown[]): Find[] {
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
      id: url.slice(0, 200),
      title: title.slice(0, 120),
      blurb: String(r.blurb ?? '')
        .trim()
        .slice(0, 280),
      why: String(r.why ?? '')
        .trim()
        .slice(0, 90),
      url,
      image: isHttp(r.image) ? String(r.image).trim() : null,
      source: String(r.source || new URL(url).hostname.replace(/^www\./, '')).slice(0, 40),
      tag: String(r.tag || 'Find').slice(0, 16),
    })
    if (out.length === 6) break
  }
  return out
}

/** Fallback when finds.set never arrived: a JSON block in her reply, else her Markdown links/images. */
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
  const out = cleanFinds(list)
  const seen = new Set(out.map((x) => x.url))
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

export const FIND_DIRECTIVE = `Find me today's fun stuff: 4 fun, light, genuinely interesting things from the web today that I'd personally enjoy, based on what you know about me (my interests, hobbies, where I live, what I'm working on). Mix it up: a good-news story, something nerdy or surprising, something local or seasonal, something visual. Use at most two web searches. Tell me about them in a short, fun reply, then put them on my For you card with finds.set: {items:[{title, blurb (1–2 sentences), why (why I'll like it, under 70 characters), url, image (the page's og:image), source, tag (Good news, Nerdy, Local, Visual or Weird)}]}.`

// ── The hunt: a chat turn in the dedicated thread ───────────────────────────

let bus: FrameBus | null = null
let threadId: string | null = null
let creatingThread = false
/** Set once the deploy answers conversations_disabled: no separate thread is possible. */
let threadsOff = false
let huntTimer: ReturnType<typeof setTimeout> | undefined
let graceTimer: ReturnType<typeof setTimeout> | undefined
let buffer = ''
/** finds.set items that arrived during the current hunt, before its done. */
let pending: Find[] | null = null
/** How long to wait after done for a finds.set that may still be on its way. */
const SET_GRACE_MS = 1500

function readThread(): { id: string; owner: string | null } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(THREAD_KEY) ?? 'null') as { id?: string; owner?: string | null } | null
    return raw?.id ? { id: raw.id, owner: raw.owner ?? null } : null
  } catch {
    return null
  }
}

function writeThread(id: string | null) {
  threadId = id
  try {
    if (id) localStorage.setItem(THREAD_KEY, JSON.stringify({ id, owner }))
    else localStorage.removeItem(THREAD_KEY)
  } catch {
    /* private mode */
  }
}

/** Is this the "Fun finds" thread (never the user's own conversation)? */
export const isFindsThread = (id: string | null | undefined): boolean => !!id && id === threadId

/** The finds thread was deleted (or everything was purged): start a new one next hunt. */
export function forgetFindsThread(id?: string): void {
  if (!id || id === threadId) writeThread(null)
}

function finish(items: Find[] | null, note?: string) {
  clearTimeout(huntTimer)
  clearTimeout(graceTimer)
  graceTimer = undefined
  buffer = ''
  pending = null
  creatingThread = false
  if (!items || !items.length) {
    useFinds.setState({ status: useFinds.getState().items.length ? 'ready' : 'error', progress: '' })
    return
  }
  const next = { items, day: today(), seen: [] as string[], note: note ?? useFinds.getState().note }
  useFinds.setState({ ...next, status: 'ready', progress: '' })
  save(next)
}

/**
 * Wendy's finds.set ui_action. During a hunt it waits for her reply to finish
 * so the note and the cards land together; any other time (she found fun
 * stuff in the main chat) the cards update straight away.
 */
export function setFinds(list: unknown[]): void {
  const items = cleanFinds(list)
  if (!items.length) return
  if (useFinds.getState().status !== 'hunting') return finish(items)
  pending = items
  // Her reply already finished and we're waiting on this: land now.
  if (graceTimer) finish(items, useFinds.getState().note)
}

function sendHunt() {
  if (!bus || !threadId) return finish(null)
  buffer = ''
  if (!bus.send({ type: 'chat', message: FIND_DIRECTIVE, conversationId: threadId })) finish(null)
}

/** Start a hunt now (the "Find me more" option, or the daily refresh). */
export function hunt(): void {
  if (!bus || useFinds.getState().status === 'hunting') return
  if (threadsOff) return useFinds.setState({ status: 'unavailable' })
  useFinds.setState({ status: 'hunting', progress: '' })
  clearTimeout(huntTimer)
  huntTimer = setTimeout(() => finish(null), HUNT_TIMEOUT_MS)
  if (threadId) return sendHunt()
  // First hunt ever: create the "Fun finds" thread, then hand the socket's
  // active thread back to the user's conversation.
  creatingThread = true
  if (!bus.send({ type: 'conversation.new' })) finish(null)
}

/**
 * Called by the router before the main chat handler. Claims every frame that
 * belongs to the finds thread (and the conversation.created for it), so none of
 * it shows up in the user's conversation.
 */
export function handleFindsFrame(f: ServerFrame): boolean {
  const cid = typeof f.conversationId === 'string' ? f.conversationId : null
  if (f.type === 'error' && f.code === 'conversations_disabled') {
    // Threading is off on this deploy: the only way to learn it. A hunt here
    // would land in the user's own conversation, so finds stay off instead.
    threadsOff = true
    if (useFinds.getState().status === 'hunting' || creatingThread) {
      clearTimeout(huntTimer)
      creatingThread = false
      useFinds.setState({ status: 'unavailable', progress: '' })
    }
    return false // the rest of the app may care too
  }
  if (f.type === 'conversation.created' && creatingThread && cid) {
    creatingThread = false
    writeThread(cid)
    bus?.send({ type: 'conversation.rename', conversationId: cid, title: 'Fun finds' })
    const main = useAgent.getState().conversationId
    // conversation.new made the finds thread active; switch back to the user's own.
    // (With none yet, their first message creates it: chat.ts never relies on "active".)
    if (main) bus?.send({ type: 'conversation.open', conversationId: main, limit: 40 })
    sendHunt()
    return true
  }
  if (!cid || cid !== threadId) return false
  switch (f.type) {
    case 'conversation.active':
    case 'conversation.messages':
      // Thread-level state belongs to the router (which never adopts this thread).
      return false
    case 'token':
      buffer += String(f.delta ?? '')
      useFinds.setState({ progress: buffer.slice(-80) })
      return true
    case 'done': {
      const note = String(f.text ?? buffer).trim()
      useFinds.setState({ note })
      if (pending) {
        finish(pending, note)
        return true
      }
      // finds.set may still be in flight (or lost on another server instance):
      // wait a moment, then fall back to reading the cards out of her reply.
      graceTimer = setTimeout(() => {
        graceTimer = undefined
        finish(pending ?? parseFinds(note), note)
      }, SET_GRACE_MS)
      return true
    }
    case 'error':
      // The thread may have been deleted: forget it and start a new one next time.
      if (f.code === 'conversation_failed') writeThread(null)
      finish(null)
      return true
    case 'event':
      return false
    default:
      // chat.start, tool.progress, conversation.updated…: ours, nothing to render.
      return true
  }
}

/**
 * Wire to the live socket. Hunts once a day, only once the app is connected,
 * loaded and the user isn't mid-conversation; a dropped connection resets an
 * in-flight hunt so the next connect retries instead of waiting on a lost turn.
 */
export function startFinds(socket: FrameBus): () => void {
  bus = socket
  const maybeHunt = () => {
    const a = useAgent.getState()
    const loaded = Object.values(useEntities.getState().hydrated).every(Boolean)
    const s = useFinds.getState()
    const idle = !a.turnId && !a.awaitingTurn
    const due = s.day !== today() && s.status !== 'hunting' && s.status !== 'error' && s.status !== 'unavailable'
    if (a.connection === 'open' && a.userId !== null && loaded && idle && due && !threadsOff) hunt()
  }
  const offA = useAgent.subscribe((s, p) => {
    if (s.connection !== 'open' && p.connection === 'open' && useFinds.getState().status === 'hunting') {
      clearTimeout(huntTimer)
      clearTimeout(graceTimer)
      graceTimer = undefined
      pending = null
      creatingThread = false
      buffer = ''
      useFinds.setState({ status: useFinds.getState().items.length ? 'ready' : 'idle', progress: '' })
    }
    maybeHunt()
  })
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
