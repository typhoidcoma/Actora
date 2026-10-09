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
import { useFinds } from '../finds/finds'
import { useVault } from '../stores/vault'
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
    const option = sayOption(label, say, 'wendy')
    if (!feasible(option)) continue
    out.push(option)
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
    const details = itemDetails(kind, id, s)
    if (details) lines.push(`Its details: ${details}.`)
  } else if (key === 'vault') {
    const mem = Object.values(useVault.getState().entries).slice(0, 12)
    lines.push(
      `Screen: the Memories panel, everything Wendy remembers about the user (${mem.length} shown): ${mem.map((m) => `"${m.content.slice(0, 80)}"`).join('; ') || 'nothing yet'}.`,
      'Options should help curate it: correct or update something, forget something outdated, or add something new about themselves.',
    )
  } else if (key === 'finds' || key.startsWith('find:')) {
    const fs = useFinds.getState()
    if (key === 'finds') {
      lines.push(
        `Screen: Wendy's fun finds page${fs.headline ? `, headed "${fs.headline}"` : ''}. The finds: ${
          fs.items.map((x) => `"${x.title}" (${x.tag}, ${x.source})`).join('; ') || 'none yet'
        }.`,
      )
      if (fs.note) lines.push(`What Wendy said about them: ${fs.note.slice(0, 500)}`)
      lines.push(
        'Make the options act on these finds by name: put one on the calendar, set a reminder, save one as a task, dig deeper into one, or find more like one.',
      )
    } else {
      const f = fs.items.find((x) => x.id === key.slice('find:'.length))
      if (f)
        lines.push(
          `Screen: the user tapped the find "${f.title}" (${f.source}, ${f.url}): ${f.blurb}`,
          'Options should act on this find: when to go or do it, put it on the calendar, a reminder, save it, dig deeper, or more like it.',
        )
    }
  }
  // What else is visible, so options can refer to it.
  const ui = useUi.getState()
  if (ui.reader) lines.push("The reader is open, showing Wendy's latest full answer.")
  const finds = useFinds.getState().items
  if (key === 'home' && finds.length)
    lines.push(
      `Box 4 has Wendy's fun finds: ${finds
        .map((x) => `"${x.title}"`)
        .slice(0, 4)
        .join(', ')}.`,
    )
  const mood = s.agent.mood
  if (mood?.emotion) lines.push(`Wendy's current mood: ${mood.emotion}${mood.intensity ? ` (${mood.intensity})` : ''}.`)
  if (s.agent.line === 'greeting' && s.agent.greeting?.text)
    lines.push(`Wendy's line above the grid says: "${s.agent.greeting.text.slice(0, 200)}"`)
  if (s.agent.line === 'notice' && s.agent.notice) {
    lines.push(
      `Wendy just told the user about a reminder: "${s.agent.notice.title}" ${s.agent.notice.body ?? ''}`.trim(),
    )
  }
  return lines.join('\n')
}

/** What a tapped "say" can actually get done: Wendy's tools on Aelora (WEBSOCKET.md) plus conversation. */
const CAN_DO = `What Wendy can actually do when the user taps a button (nothing else):
- Tasks: add, list, complete, edit, delete, reschedule. Goals: add, review progress, edit, complete.
- Calendar: list events, create events, move or delete events (events with other guests need the user's confirmation).
- Reminders: schedule a reminder at a time, list them, mark read, cancel.
- Memory: remember a fact about the user, recall what she knows, search past conversations.
- Web search with images and links (news, ideas, recommendations, facts), and the user's uploaded documents.
- Email, only if the user has connected Google: search and read mail, draft replies (the user confirms before anything is sent).
- Talk: advice, planning, breaking work into steps, reflection, encouragement.
- In the app: open lists (tasks, calendar, goals, inbox), open an item, show fun finds.
She cannot book, buy, order, pay, call, text or message people, play media, set device alarms or timers, navigate, or control other apps.`

const SYSTEM = `You write the tap-to-reply buttons for Wendy, a warm personal assistant inside a touch-only app.
The user never types: these buttons are the only way they talk to Wendy, so they must cover what the user would most likely want to say next.
Rules:
- Return JSON only: {"options":[{"label":"...","say":"..."}]}
- 3 to 5 options. "label": 1-4 words, at most ${MAX_LABEL} characters, sentence case, no emoji, no trailing period. "say": exactly what the user says to Wendy when they tap it, first person, natural, at most 120 characters.
- If Wendy's last message asks a question or offers choices, the options must be direct answers to it (include a yes and a no style answer for yes/no questions).
- Otherwise suggest the most useful next things for what is on screen, using the user's real item titles.
- On the home screen, the app already offers one button for the top priority card. Yours can act on the other cards by name (for example "Prep for Standup" or "Start the report"), but mix in what fits the moment: the time of day, what you know the user cares about, what they were just talking about.
- Order them by how likely the user is to tap them, most likely first. If Wendy's last message asks something, the direct answers come first.
- Make them distinct; never two options that do the same thing. Match a relaxed, adult, friendly tone.
- Every option must be something Wendy can actually do (see the list above). Never suggest booking, buying, calling, texting, timers or anything outside it.
- Ground options in what is really there: the user's actual items, what Wendy just said, and what you know about the user from memory. Never invent items, people or plans.
- Follow the conversation: if they're mid-topic, offer the natural next steps in that topic rather than jumping back to the cards.
- Don't repeat what the user just tapped or what they keep ignoring (listed below); find a fresher, more specific idea instead.`

export function buildRequest(key: string, s: Snapshot, existing: Option[]): LlmRequest {
  const summary = screenSummary(key, s)
  const turns = s.agent.messages
    .filter((m) => m.role !== 'error')
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Wendy'}: ${m.text.slice(0, 400)}`)
  const last = [...s.agent.messages].reverse().find((m) => m.role === 'assistant')
  const lastUser = [...s.agent.messages].reverse().find((m) => m.role === 'user')?.text
  const replyingTo = s.agent.line === 'reply' || key === 'chat' ? last?.text : undefined

  // What the user did with earlier options, so the next set moves on.
  const h = useOptionsStore.getState().history
  const now = Date.now()
  const tapped = h.tapped.filter((t) => now - t.at < 60 * 60_000).map((t) => t.label)
  const ignored = Object.entries(h.shown)
    .filter(([, v]) => v.n >= 3 && now - v.lastAt < 2 * 3_600_000)
    .map(([label]) => label)
    .filter((label) => !tapped.some((t) => t.toLowerCase() === label))

  const prompt = [
    summary,
    turns.length ? `\nRecent conversation:\n${turns.join('\n')}` : '',
    replyingTo ? `\nWendy's last message (answer this if it asks something):\n${replyingTo.slice(0, 600)}` : '',
    existing.length ? `\nButtons already shown, do not repeat: ${existing.map((o) => o.label).join(', ')}.` : '',
    tapped.length
      ? `\nRecently tapped (don't offer again unless something changed): ${tapped.slice(-6).join(', ')}.`
      : '',
    ignored.length ? `\nOffered repeatedly and ignored (don't offer): ${ignored.slice(0, 8).join(', ')}.` : '',
    '\nWrite the options.',
  ].join('\n')
  return {
    system: `${SYSTEM}\n\n${CAN_DO}`,
    prompt: prompt.slice(0, 11_000),
    json: true,
    maxTokens: 300,
    // Recall facts about what's actually in play: the topic they're on, else what's on screen.
    context: { profile: true, memoryQuery: (lastUser ?? focusOf(key, s) ?? 'what matters to me today').slice(0, 200) },
  }
}

/** The title of what's in focus (an open item, else the top card), for memory recall. */
function focusOf(key: string, s: Snapshot): string | null {
  if (key.startsWith('item:')) {
    const [, kind, ...rest] = key.split(':')
    const id = rest.join(':')
    const e = s.entities
    return (
      (kind === 'task'
        ? e.tasks[id]?.title
        : kind === 'goal'
          ? e.goals[id]?.title
          : kind === 'notification'
            ? e.notifications[id]?.title
            : Object.values(e.events).find((x) => x.id === id)?.title) ?? null
    )
  }
  if (key.startsWith('tile:')) return `my ${key.slice(5)}`
  return s.cards?.[0]?.title ?? null
}

/** One line of facts about an item, so options can be specific ("due Friday, 2 of 5 done"). */
function itemDetails(kind: string, id: string, s: Snapshot): string | null {
  const e = s.entities
  if (kind === 'task') {
    const t = e.tasks[id]
    if (!t) return null
    return [
      `status ${t.status}`,
      t.due_date ? `due ${t.due_date}` : 'no due date',
      t.estimated_minutes ? `about ${t.estimated_minutes} min` : null,
      t.goal_id && e.goals[t.goal_id] ? `for goal "${e.goals[t.goal_id].title}"` : null,
    ]
      .filter(Boolean)
      .join(', ')
  }
  if (kind === 'goal') {
    const g = e.goals[id]
    if (!g) return null
    const linked = Object.values(e.tasks).filter((t) => t.goal_id === id)
    const done = linked.filter((t) => t.status === 'done').length
    return [
      `status ${g.status}`,
      g.timeframe ? `timeframe ${g.timeframe}` : null,
      `${done} of ${linked.length} tasks done`,
    ]
      .filter(Boolean)
      .join(', ')
  }
  if (kind === 'event') {
    const ev = Object.values(e.events).find((x) => x.id === id)
    if (!ev) return null
    return [`${fmtTime(ev.start_time)}–${fmtTime(ev.end_time)}`, ev.location ? `at ${ev.location}` : null]
      .filter(Boolean)
      .join(', ')
  }
  if (kind === 'notification') {
    const n = e.notifications[id]
    return n ? `${n.read_at ? 'read' : 'unread'}${n.body ? `, says "${n.body.slice(0, 160)}"` : ''}` : null
  }
  return null
}

/** A last line of defence: drop suggestions for things Wendy has no way to do. */
const CANT =
  /\b(book|buy|order|purchase|pay|call|phone|text|sms|whatsapp|play|timer|alarm|navigate|directions|uber|lyft|venmo)\b/i

export function feasible(o: Option): boolean {
  return !CANT.test(`${o.label} ${o.say ?? ''}`)
}

export function snapshot(): Snapshot {
  const now = Date.now()
  const entities = useEntities.getState()
  const p = usePriorityStore.getState()
  return {
    entities,
    agent: useAgent.getState(),
    push: usePush.getState(),
    now,
    cards: mergePriorities(
      scoreItems(entities, now),
      p.wendy,
      p.pushed && p.pushed.until > now ? p.pushed.entries : null,
    ),
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
