import { LlmError, llm, type LlmRequest } from '../aelora/http'
import { config } from '../config'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { scoreItems } from '../priority/score'
import { optionsStore, useOptionsStore } from '../stores/options'
import { mergePriorities, usePriorityStore } from '../stores/priority'
import { usePush } from '../stores/push'
import { contextKeyOf, useUi } from '../stores/ui'
import { useSky } from '../weather/sky'
import { localOptions, type Snapshot } from './local'
import { sayOption, type Option } from './types'

// Wendy-written tap replies, generated with Aelora's stateless POST /api/llm
// (memory-grounded via `context`). They refine the instant local options.

const MAX_LABEL = 28
const MAX_SAY = 160
const DEBOUNCE_MS = 350
const CACHE_MS = 3 * 60_000

/** Strict-but-forgiving parse: tolerates code fences and a bare array; drops anything malformed. */
export function parseWendyOptions(text: string): Option[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
  let data: unknown
  try {
    data = JSON.parse(cleaned)
  } catch {
    return []
  }
  const list = Array.isArray(data) ? data : (data as { options?: unknown })?.options
  if (!Array.isArray(list)) return []
  const out: Option[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const label = String((raw as { label?: unknown }).label ?? '')
      .trim()
      .replace(/[.。]+$/, '')
    const say = String((raw as { say?: unknown }).say ?? label).trim()
    if (!label || label.length > MAX_LABEL || !say || say.length > MAX_SAY) continue
    const k = label.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(sayOption(label, say, 'wendy'))
    if (out.length >= 5) break
  }
  return out
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function partOfDay(d: Date): string {
  const h = d.getHours()
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night'
}

/** What is on screen, in a few compact lines, with real item titles. */
export function screenSummary(key: string, s: Snapshot): string {
  const now = new Date(s.now)
  const sky = useSky.getState()
  const lines = [
    `Time: ${now.toLocaleDateString([], { weekday: 'long' })} ${partOfDay(now)}, ${fmtTime(now.toISOString())}.`,
  ]
  if (sky.source === 'live' && sky.temp !== null)
    lines.push(`Weather: ${Math.round(sky.temp)}°${sky.unit}, ${sky.kind}.`)

  const tasks = Object.values(s.entities.tasks).filter((t) => t.status !== 'done' && t.status !== 'skipped')
  const events = Object.values(s.entities.events)
    .filter((e) => Date.parse(e.end_time) > s.now)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
  const unread = Object.values(s.entities.notifications).filter((n) => !n.read_at)
  const goals = Object.values(s.entities.goals).filter((g) => g.status === 'active')
  const taskLine = (n: number) =>
    `Open tasks: ${
      tasks
        .slice(0, n)
        .map((t) => `"${t.title}"${t.due_date ? ` (due ${t.due_date})` : ''}`)
        .join(', ') || 'none'
    }.`
  const eventLine = (n: number) =>
    `Upcoming: ${
      events
        .slice(0, n)
        .map((e) => `"${e.title}" at ${fmtTime(e.start_time)}`)
        .join(', ') || 'nothing'
    }.`

  if (key === 'home') {
    const p = usePriorityStore.getState()
    const top = mergePriorities(
      scoreItems(s.entities, s.now),
      p.wendy,
      p.pushed && p.pushed.until > s.now ? p.pushed.entries : null,
    )
    lines.push(
      `Screen: home. The three priority cards, in order: ${top.map((t, i) => `#${i + 1} ${t.kind} "${t.title}" (${t.meta})`).join('; ') || 'none'}. Box 4 shows Wendy's latest answer.`,
      taskLine(5),
      eventLine(3),
    )
    lines.push(
      `Unread notifications: ${
        unread
          .map((n) => `"${n.title}"`)
          .slice(0, 3)
          .join(', ') || 'none'
      }.`,
    )
    lines.push(
      `Active goals: ${
        goals
          .map((g) => `"${g.title}"`)
          .slice(0, 3)
          .join(', ') || 'none'
      }.`,
    )
  } else if (key === 'chat') {
    lines.push('Screen: the full chat with Wendy is open.')
  } else if (key.startsWith('tile:')) {
    const tile = key.slice(5)
    lines.push(`Screen: the ${tile} panel is open.`)
    if (tile === 'tasks') lines.push(taskLine(8))
    if (tile === 'calendar') lines.push(eventLine(8))
    if (tile === 'goals') lines.push(`Active goals: ${goals.map((g) => `"${g.title}"`).join(', ') || 'none'}.`)
    if (tile === 'inbox')
      lines.push(
        `Unread: ${
          unread
            .map((n) => `"${n.title}"`)
            .slice(0, 8)
            .join(', ') || 'none'
        }.`,
      )
  } else if (key.startsWith('item:')) {
    const [, kind, ...rest] = key.split(':')
    const id = rest.join(':')
    const e = s.entities
    const title =
      kind === 'task'
        ? e.tasks[id]?.title
        : kind === 'goal'
          ? e.goals[id]?.title
          : kind === 'notification'
            ? e.notifications[id]?.title
            : Object.values(e.events).find((x) => x.id === id)?.title
    lines.push(`Screen: the user tapped the ${kind} "${title ?? 'unknown'}" and is looking at its actions.`)
  }
  if (s.agent.line === 'notice' && s.agent.notice) {
    lines.push(
      `Wendy just told the user about a reminder: "${s.agent.notice.title}" ${s.agent.notice.body ?? ''}`.trim(),
    )
  }
  return lines.join('\n')
}

const SYSTEM = `You write the tap-to-reply buttons for Wendy, a warm personal assistant inside a touch-only app.
The user never types: these buttons are the only way they talk to Wendy, so they must cover what the user would most likely want to say next.
Rules:
- Return JSON only: {"options":[{"label":"...","say":"..."}]}
- 3 to 5 options. "label": 1-4 words, at most ${MAX_LABEL} characters, sentence case, no emoji, no trailing period. "say": exactly what the user says to Wendy when they tap it, first person, natural, at most 120 characters.
- If Wendy's last message asks a question or offers choices, the options must be direct answers to it (include a yes and a no style answer for yes/no questions).
- Otherwise suggest the most useful next things for what is on screen, using the user's real item titles.
- Make them distinct; never two options that do the same thing. Match a relaxed, adult, friendly tone.`

export function buildRequest(key: string, s: Snapshot, existing: Option[]): LlmRequest {
  const summary = screenSummary(key, s)
  const turns = s.agent.messages
    .filter((m) => m.role !== 'error')
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Wendy'}: ${m.text.slice(0, 400)}`)
  const last = [...s.agent.messages].reverse().find((m) => m.role === 'assistant')
  const replyingTo = s.agent.line === 'reply' || key === 'chat' ? last?.text : undefined
  const prompt = [
    summary,
    turns.length ? `\nRecent conversation:\n${turns.join('\n')}` : '',
    replyingTo ? `\nWendy's last message (answer this if it asks something):\n${replyingTo.slice(0, 600)}` : '',
    existing.length ? `\nButtons already shown, do not repeat: ${existing.map((o) => o.label).join(', ')}.` : '',
    '\nWrite the options.',
  ].join('\n')
  return {
    system: SYSTEM,
    prompt: prompt.slice(0, 11_000),
    json: true,
    maxTokens: 300,
    context: { profile: true, memoryQuery: summary.split('\n').slice(1, 3).join(' ').slice(0, 200) },
  }
}

export function snapshot(): Snapshot {
  return {
    entities: useEntities.getState(),
    agent: useAgent.getState(),
    push: usePush.getState(),
    now: Date.now(),
  }
}

/** Cache identity: the context plus what Wendy last said and what the line shows. */
function signature(key: string): string {
  const a = useAgent.getState()
  const lastId = a.messages.at(-1)?.id ?? '-'
  return `${key}|${lastId}|${a.line}|${a.notice?.notificationId ?? '-'}`
}

/**
 * Watches the screen and the conversation; whenever either changes, asks Wendy
 * for fresh options (debounced, one in flight, cached, 429-aware).
 */
export function startWendyOptions(): () => void {
  const cache = new Map<string, { at: number; options: Option[] }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let inflight: AbortController | null = null
  let pausedUntil = 0
  let lastSig = ''

  const generate = async () => {
    const a = useAgent.getState()
    if (a.connection !== 'open' || a.turnId || a.awaitingTurn) return
    const key = contextKeyOf(useUi.getState())
    const sig = signature(key)
    if (sig === lastSig) return
    lastSig = sig

    const hit = cache.get(sig)
    if (hit && Date.now() - hit.at < CACHE_MS) {
      optionsStore.setWendy(key, hit.options)
      return
    }
    if (Date.now() < pausedUntil) return

    inflight?.abort()
    const ctrl = new AbortController()
    inflight = ctrl
    const snap = snapshot()
    const req = buildRequest(key, snap, localOptions(key, snap))
    // Drop options written for an earlier moment (e.g. answers to a previous question).
    optionsStore.setWendy(key, [])
    optionsStore.setLoading(key, true)
    try {
      const text = config.mock
        ? await (await import('../aelora/mock')).mockLlm(req, ctrl.signal)
        : await llm(req, ctrl.signal)
      if (ctrl.signal.aborted) return
      const options = parseWendyOptions(text)
      cache.set(sig, { at: Date.now(), options })
      // Only apply if the user is still where we generated for.
      if (contextKeyOf(useUi.getState()) === key) optionsStore.setWendy(key, options)
      else optionsStore.setLoading(key, false)
    } catch (e) {
      if (ctrl.signal.aborted) return
      if (e instanceof LlmError && e.status === 429) pausedUntil = Date.now() + (e.retryAfterMs ?? 10_000)
      optionsStore.setLoading(key, false)
      lastSig = '' // allow a retry on the next change
    } finally {
      if (inflight === ctrl) inflight = null
    }
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void generate(), DEBOUNCE_MS)
  }

  const offUi = useUi.subscribe((s, p) => {
    if (contextKeyOf(s) !== contextKeyOf(p)) {
      optionsStore.clearPushed()
      schedule()
    }
  })
  const offAgent = useAgent.subscribe((s, p) => {
    const turnEnded = (p.turnId || p.awaitingTurn) && !s.turnId && !s.awaitingTurn
    if (
      turnEnded ||
      s.line !== p.line ||
      s.notice !== p.notice ||
      (s.connection === 'open' && p.connection !== 'open')
    ) {
      schedule()
    }
  })
  // First data load: regenerate once entities hydrate so options use real titles.
  const offEntities = useEntities.subscribe((s, p) => {
    if (s.hydrated !== p.hydrated && Object.values(s.hydrated).every(Boolean)) {
      lastSig = ''
      schedule()
    }
  })
  schedule()

  return () => {
    clearTimeout(timer)
    inflight?.abort()
    offUi()
    offAgent()
    offEntities()
    useOptionsStore.setState({ byKey: {}, pushed: null })
  }
}
