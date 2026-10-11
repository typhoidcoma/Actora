import { create } from 'zustand'
import { greet } from '../aelora/client'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { optionsStore, useOptionsStore } from '../stores/options'
import { useSession } from '../stores/session'
import { contextKeyOf, panelOpen, useUi } from '../stores/ui'
import { actOption, sayOption } from '../options/types'
import { awayWords } from '../aelora/greeting'

/**
 * The agent checks in now and then while the user is around: "Just checking how
 * the deck is going, anything I can take off your plate?". Only from the app,
 * because only the app knows they're actually here: on the home screen, not
 * touched for a couple of minutes but active in the last half hour, nothing
 * else going on. Random gaps (60–120 min), at most a few a day, never in quiet
 * hours or soon after a conversation. "Not now", or two ignored in a row,
 * doubles the gap. The user (or the agent, via checkins.set) can turn it off.
 *
 * It goes over the welcome's path (system_chat), so it shows as her line,
 * joins the chat, and rides along as screen.yourGreeting when answered.
 */

const KEY = 'actora.checkins.v1'
const MIN_GAP = 60 * 60_000
const MAX_GAP = 120 * 60_000
const PER_DAY = 4
/** Not touched for this long: they're around but not busy. */
const IDLE_MS = 2 * 60_000
/** ...and touched within this: they're actually still here. */
const PRESENT_MS = 30 * 60_000
/** Never this soon after a conversation (or her welcome). */
const AFTER_CHAT_MS = 20 * 60_000
const QUIET_FROM = 21
const QUIET_UNTIL = 8
const MAX_BACKOFF = 8
/** Nothing in the first half hour after the app opens. */
const OPEN_GRACE_MS = 30 * 60_000

export interface CheckinState {
  on: boolean
  /** When the last one was sent (ms), and the day ("YYYY-MM-DD") the count is for. */
  lastAt: number
  day: string
  count: number
  /** The gap multiplier: doubled by "Not now" or two ignored in a row, reset by an answer. */
  backoff: number
  ignored: number
  /** The next one isn't before this (random within the gap, set when one is sent). */
  nextAt: number
  /** The text of the last one, until it's answered (to tell an answer from silence). */
  open: string | null
}

const fresh = (): CheckinState => ({
  on: true,
  lastAt: 0,
  day: '',
  count: 0,
  backoff: 1,
  ignored: 0,
  nextAt: 0,
  open: null,
})

export const useCheckins = create<CheckinState>(fresh)

let owner: string | null = null

function load(user: string | null) {
  owner = user
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { owner?: string; state?: CheckinState } | null
    useCheckins.setState(r && r.owner === user && r.state ? { ...fresh(), ...r.state } : fresh())
  } catch {
    useCheckins.setState(fresh())
  }
  // Just opened the app: her welcome has that moment; the first check-in waits a while.
  const grace = Date.now() + OPEN_GRACE_MS
  if (useCheckins.getState().nextAt < grace) useCheckins.setState({ nextAt: grace })
}

function save() {
  if (!owner) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ owner, state: useCheckins.getState() }))
  } catch {
    /* private mode */
  }
}

const update = (patch: Partial<CheckinState>) => {
  useCheckins.setState(patch)
  save()
}

/** Menu switch, and the agent's checkins.set. */
export function setCheckins(on: boolean): void {
  update({ on, ...(on ? { backoff: 1, ignored: 0 } : {}) })
}

/** "Not now": back off, and put her line back to quiet. */
export function checkinLater(): void {
  const s = useCheckins.getState()
  const backoff = Math.min(MAX_BACKOFF, s.backoff * 2)
  update({ open: null, backoff, nextAt: Date.now() + MIN_GAP * backoff })
  const a = useAgent.getState()
  if (a.greeting.checkin) useAgent.setState({ greeting: { text: '', streaming: false } })
  optionsStore.clearPushed()
}

const dayOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface Moment {
  now: number
  hour: number
  /** Last pointer/key/scroll in the app. */
  lastActivity: number
  /** Last thing said in the chat (or her last welcome). */
  lastChat: number
  home: boolean
  visible: boolean
  busy: boolean
}

/** Whether a check-in may go now (pure, so it can be tested). */
export function checkinDue(s: CheckinState, m: Moment): boolean {
  if (!s.on || !m.home || !m.visible || m.busy) return false
  if (m.hour >= QUIET_FROM || m.hour < QUIET_UNTIL) return false
  const idle = m.now - m.lastActivity
  if (idle < IDLE_MS || idle > PRESENT_MS) return false
  if (m.now - m.lastChat < AFTER_CHAT_MS) return false
  if (m.now < s.nextAt) return false
  if (s.day === dayOf(m.now) && s.count >= PER_DAY) return false
  return true
}

/** The gap before the next one: random in 60–120 min, stretched by backoff. */
export const nextGap = (backoff: number, r = Math.random()) => (MIN_GAP + r * (MAX_GAP - MIN_GAP)) * backoff

export interface CheckinFacts {
  focus: { minutes: number; on: string | null } | null
  lastChat: { user: string | null; agent: string | null; ago: number } | null
  endedEvent: { title: string; ago: number } | null
  overdue: string[]
  topTask: string | null
  part: string
  recent: string[]
}

export function checkinDirective(f: CheckinFacts): string {
  const lines = [
    "APP EVENT: a casual check-in. The user has the Actora app open and is around, but hasn't said anything for a while. Check in on them as ${agentName()}, like a friend who's on their side, not a notification.",
    'One or two short sentences, at most 28 words. Plain text, no emoji. Ask about ONE thing (the most worthwhile below), and offer a hand with it. Never list things, never nag about being productive.',
    'Then give 2–3 tap answers as links, written the way the user would say them: [Going well](say:It is going well) [Help me with it](say:Can you help me with it?).',
  ]
  const things: string[] = []
  if (f.focus)
    things.push(`They're ${f.focus.minutes} minutes into a focus session${f.focus.on ? ` on "${f.focus.on}"` : ''}.`)
  if (f.endedEvent) things.push(`"${f.endedEvent.title}" ended ${awayWords(f.endedEvent.ago)} ago: ask how it went.`)
  if (f.lastChat && (f.lastChat.user || f.lastChat.agent) && f.lastChat.ago < 12 * 3600_000)
    things.push(
      `Your chat ${awayWords(f.lastChat.ago)} ago:${f.lastChat.user ? ` they said "${f.lastChat.user}".` : ''}${f.lastChat.agent ? ` You said "${f.lastChat.agent}".` : ''} Follow up if it was left open.`,
    )
  if (f.overdue.length) things.push(`Overdue: ${f.overdue.map((t) => `"${t}"`).join(', ')}.`)
  if (f.topTask) things.push(`Their top task: "${f.topTask}".`)
  lines.push(
    things.length
      ? `Worth asking about, most worthwhile first:\n- ${things.join('\n- ')}`
      : 'Nothing in particular is going on: just ask how their day is going and if anything is on their mind.',
  )
  lines.push(`It's ${f.part}.`)
  if (f.recent.length)
    lines.push(`Your recent check-ins, don't repeat their wording: ${f.recent.map((r) => `"${r}"`).join(' / ')}`)
  return lines.join('\n')
}

const clip = (t: string, n: number) => {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1).trimEnd()}…` : one
}

function facts(now: number, recent: string[]): CheckinFacts {
  const { tasks, events } = useEntities.getState()
  const session = useSession.getState().active
  const msgs = useAgent.getState().messages.filter((b) => !b.greeting && b.role !== 'error')
  const last = msgs.at(-1)
  const lastAt = Date.parse(last?.at ?? '')
  const today = dayOf(now)
  const open = Object.values(tasks).filter((t) => t.status !== 'done' && t.status !== 'skipped')
  const ended = Object.values(events)
    .filter((e) => !e.all_day && Date.parse(e.end_time) < now && now - Date.parse(e.end_time) < 90 * 60_000)
    .sort((a, b) => Date.parse(b.end_time) - Date.parse(a.end_time))[0]
  const h = new Date(now).getHours()
  return {
    focus: session
      ? { minutes: Math.round((now - Date.parse(session.started_at)) / 60_000), on: session.anchor_response }
      : null,
    lastChat:
      last && Number.isFinite(lastAt)
        ? {
            user: (() => {
              const u = msgs.findLast((b) => b.role === 'user')
              return u ? clip(u.text, 160) : null
            })(),
            agent: (() => {
              const w = msgs.findLast((b) => b.role === 'assistant')
              return w ? clip(w.text, 200) : null
            })(),
            ago: now - lastAt,
          }
        : null,
    endedEvent: ended ? { title: ended.title, ago: now - Date.parse(ended.end_time) } : null,
    overdue: open
      .filter((t) => t.due_date && t.due_date < today)
      .slice(0, 2)
      .map((t) => t.title),
    topTask: open.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0]?.title ?? null,
    part: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
    recent,
  }
}

const RECENT_KEY = 'actora.checkins.recent.v1'
function recent(): string[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null') as { owner?: string; lines?: string[] } | null
    return r && r.owner === owner && Array.isArray(r.lines) ? r.lines : []
  } catch {
    return []
  }
}
function rememberLine(text: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ owner, lines: [text, ...recent()].slice(0, 3) }))
  } catch {
    /* private mode */
  }
}

/** Sends a check-in now (the timing checks are startCheckins'; dev: __actora.checkin()). */
export function sendCheckin(now = Date.now()): boolean {
  const c = useCheckins.getState()
  // The last one went unanswered: two in a row and she backs off.
  const ignored = c.open ? c.ignored + 1 : 0
  const backoff = ignored >= 2 ? Math.min(MAX_BACKOFF, c.backoff * 2) : c.backoff
  const before = useOptionsStore.getState().pushed
  const sent = greet(
    checkinDirective(facts(now, recent())),
    (text) => {
      if (!text.trim()) return
      rememberLine(text.trim().slice(0, 160))
      update({ open: text.trim() })
      // Her tap answers (if she wrote some just now), plus a way to wave it off.
      const key = contextKeyOf(useUi.getState())
      const pushed = useOptionsStore.getState().pushed
      const offered =
        pushed && pushed !== before && pushed.key === key
          ? pushed.options
          : [sayOption('All good', 'All good, thanks!')]
      optionsStore.push(key, [...offered.slice(0, 3), actOption('Not now', { type: 'checkinLater' })])
    },
    true,
  )
  if (!sent) return false
  useAgent.setState({ line: 'greeting', message: null })
  const today = dayOf(now)
  update({
    lastAt: now,
    day: today,
    count: c.day === today ? c.count + 1 : 1,
    ignored: ignored >= 2 ? 0 : ignored,
    backoff,
    nextAt: now + nextGap(backoff),
  })
  return true
}

export function startCheckins(): () => void {
  let lastActivity = Date.now()
  const touch = () => {
    lastActivity = Date.now()
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const
  for (const e of events) window.addEventListener(e, touch, { passive: true })

  let user: string | null | undefined
  const offUser = useAgent.subscribe((s) => {
    if (s.userId === user) return
    user = s.userId
    load(s.userId)
  })
  if (useAgent.getState().userId) {
    user = useAgent.getState().userId
    load(user)
  }

  // Answered: the user said something while it was the latest thing she said.
  const offAnswer = useAgent.subscribe((s, p) => {
    const c = useCheckins.getState()
    if (!c.open || s.messages.length <= p.messages.length) return
    if (s.messages.at(-1)?.role === 'user') update({ open: null, backoff: 1, ignored: 0 })
  })

  const check = () => {
    const a = useAgent.getState()
    const u = useUi.getState()
    const c = useCheckins.getState()
    const now = Date.now()
    const msgs = a.messages
    const lastMsg = Date.parse(msgs.at(-1)?.at ?? '')
    const busy =
      a.connection !== 'open' ||
      !!a.turnId ||
      a.awaitingTurn ||
      a.greetingPending ||
      a.line === 'notice' ||
      useOptionsStore.getState().listening ||
      u.keyboardOpen ||
      u.pastChats ||
      u.deleting ||
      u.picking !== null
    const due = checkinDue(c, {
      now,
      hour: new Date(now).getHours(),
      lastActivity,
      lastChat: Number.isFinite(lastMsg) ? lastMsg : 0,
      home: !u.chatOpen && !panelOpen(u),
      visible: document.visibilityState === 'visible',
      busy,
    })
    if (due) sendCheckin(now)
  }

  const t = setInterval(check, 30_000)
  return () => {
    clearInterval(t)
    for (const e of events) window.removeEventListener(e, touch)
    offUser()
    offAnswer()
  }
}
