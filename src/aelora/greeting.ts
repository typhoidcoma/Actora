import { useAgent } from '../stores/agent'
import { delivered } from './protocol'
import { useEntities } from '../stores/entities'
import { useSky } from '../weather/sky'
import { greet } from './client'

// Wendy's welcome line, written fresh by Wendy every time the user arrives:
// on each app open, and again when they come back after a while. Nothing is
// cached or templated; the line stays empty (the orb thinks) until her words
// stream in. Generated over system_chat (Aelora's path for app-event prompts:
// no history, mood or fact side effects), so it's told what it needs: how the
// user arrived (a reload, a short break, days away) and where the last chat
// left off.

/** Away this long, coming back counts as arriving again. */
const AWAY_MS = 20 * 60_000
const HISTORY_KEY = 'actora.greeting.recent.v1'
const HISTORY = 4
/** When this user was last here (on this device), to tell a reload from a return. */
const SEEN_KEY = 'actora.lastSeen.v1'
/** Back within this: a reload (or a quick tab switch), not an arrival. */
const RELOAD_MS = 3 * 60_000
/** A last chat older than this is history, not something to pick up. */
const PICK_UP_MS = 3 * 24 * 3600_000

type Part = 'morning' | 'afternoon' | 'evening' | 'night'

function partOfDay(d = new Date()): Part {
  const h = d.getHours()
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'
}

export type Arrival = { kind: 'first' } | { kind: 'reload' } | { kind: 'back'; away: number }

export interface Facts {
  part: Part
  weekday: string
  name: string | null
  weather: string | null
  openTasks: number
  topTask: string | null
  nextEvent: { title: string; mins: number } | null
  unread: number
  /** How they got here: a reload, a return after a while, or a first visit. */
  arrival: Arrival
  /** The last exchange in their main chat, if there is one (ago in ms; NaN if unknown). */
  lastChat: { user: string | null; wendy: string | null; ago: number } | null
}

/** "12 minutes", "3 hours", "a day", "5 days". */
export function awayWords(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24)
  return d === 1 ? 'a day' : `${d} days`
}

const clip = (t: string, n: number) => {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1).trimEnd()}…` : one
}

/** The last thing each of them said in the main chat (her welcome bubbles aside). */
function lastChat(now: number): Facts['lastChat'] {
  const m = useAgent.getState().messages.filter((b) => !b.greeting && b.role !== 'error')
  if (!m.length) return null
  const user = m.findLast((b) => b.role === 'user')
  const wendy = m.findLast((b) => b.role === 'assistant')
  const at = Date.parse(m.at(-1)?.at ?? '')
  return {
    user: user ? clip(user.text, 180) : null,
    wendy: wendy ? clip(wendy.text, 240) : null,
    ago: Number.isFinite(at) ? Math.max(0, now - at) : Number.NaN,
  }
}

function facts(arrival: Arrival, now = Date.now()): Facts {
  const { tasks, events, notifications } = useEntities.getState()
  const open = Object.values(tasks)
    .filter((t) => t.status !== 'done' && t.status !== 'skipped')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const next = Object.values(events)
    .filter((e) => Date.parse(e.start_time) > now)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]
  const sky = useSky.getState()
  const words: Record<string, string> = {
    clear: 'clear',
    partly: 'partly cloudy',
    cloudy: 'grey',
    fog: 'foggy',
    rain: 'rainy',
    storm: 'stormy',
    snow: 'snowy',
  }
  return {
    part: partOfDay(new Date(now)),
    weekday: new Date(now).toLocaleDateString([], { weekday: 'long' }),
    name: useAgent.getState().userName,
    weather:
      sky.source === 'live' && sky.temp !== null ? `${Math.round(sky.temp)}°${sky.unit}, ${words[sky.kind]}` : null,
    openTasks: open.length,
    topTask: open[0]?.title ?? null,
    nextEvent: next ? { title: next.title, mins: Math.round((Date.parse(next.start_time) - now) / 60_000) } : null,
    unread: Object.values(notifications).filter((n) => !n.read_at && delivered(n)).length,
    arrival,
    lastChat: lastChat(now),
  }
}

/**
 * Directions for the opener, not words: when there's nothing to pick up, each
 * greeting gets a different angle so two in a row never feel the same. Wendy
 * writes every word herself.
 */
export const ANGLES = [
  'a playful observation about the time of day, the weekday or the weather',
  'a tiny, doable dare or challenge for today',
  'something you remember about them that would make them smile',
  'an upbeat nudge toward the one thing that matters most right now',
  'a light, dry joke',
  'a cozy, unhurried vibe',
  'genuine curiosity about how they are or what they are up to',
  'hype: make them feel ready for the day',
  'a surprising little fact or thought that connects to their day',
] as const

export function greetingDirective(f: Facts, angle: string, recent: string[]): string {
  const c = f.lastChat
  const pickUp = !!c && Number.isFinite(c.ago) && c.ago < PICK_UP_MS
  const lines: string[] = []
  if (f.arrival.kind === 'reload') {
    lines.push(
      'APP EVENT: the user just reloaded the Actora app; they were here moments ago. This is not an arrival: no hello, no welcome.',
      'Say one short line, at most 15 words, that carries straight on from where you two were. Plain text only, no emoji.',
    )
  } else {
    lines.push(
      f.arrival.kind === 'back'
        ? `APP EVENT: the user is back in the Actora app after ${awayWords(f.arrival.away)} away. Welcome them back as Wendy.`
        : 'APP EVENT: the user just opened the Actora app. Welcome them as Wendy.',
      'One or two short sentences, at most 30 words. Plain text only: no markdown, no lists, no emoji. At most one question.',
      pickUp
        ? 'Pick up where your chat left off (below) when it was unfinished or worth a follow-up: ask how it went, or offer the next step. If it was wrapped up, open fresh instead.'
        : `Angle for this greeting: ${angle}.`,
      'Sound like someone who knows them and remembers your last conversation, never a generic assistant. Mention at most one practical thing, and only if it really matters.',
    )
  }
  if (c && (c.user || c.wendy)) {
    const ago = Number.isFinite(c.ago) ? ` (${awayWords(c.ago)} ago)` : ''
    const said = [c.user ? `they said "${c.user}"` : '', c.wendy ? `you said "${c.wendy}"` : '']
    lines.push(`Where your main chat left off${ago}: ${said.filter(Boolean).join('; ')}.`)
  } else lines.push('You have no chat with them yet.')
  lines.push(`Context: ${f.weekday} ${f.part}.${f.weather ? ` Weather: ${f.weather}.` : ''}`)
  if (f.name) lines.push(`Their name is ${f.name}.`)
  lines.push(
    `Open tasks: ${f.openTasks}${f.topTask ? ` (top: "${f.topTask}")` : ''}.`,
    f.nextEvent && f.nextEvent.mins < 24 * 60
      ? `Next event: "${f.nextEvent.title}" in ${f.nextEvent.mins} minutes.`
      : 'Nothing on the calendar soon.',
    `Unread reminders: ${f.unread}.`,
  )
  if (recent.length)
    lines.push(
      `Your last greetings, don't reuse their openings, structure or jokes: ${recent.map((r) => `"${r}"`).join(' / ')}`,
    )
  return lines.join('\n')
}

// Recent greetings are kept per user only so the next one can steer away from
// them; they're never shown again.
let owner: string | null | undefined

function recent(): string[] {
  try {
    const r = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null') as { owner?: string | null; lines?: string[] }
    return r && r.owner === owner && Array.isArray(r.lines) ? r.lines : []
  } catch {
    return []
  }
}

function remember(text: string) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ owner, lines: [text, ...recent()].slice(0, HISTORY) }))
  } catch {
    /* private mode */
  }
}

/** Called on every hello: whose greetings these are (a shared device never mixes people). */
export function adoptGreetingUser(userId: string | null): void {
  owner = userId
}

/** When this user was last here on this device (ms), or null if never. */
function lastSeen(): number | null {
  try {
    const r = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as { owner?: string | null; at?: number }
    return r && r.owner === owner && typeof r.at === 'number' ? r.at : null
  } catch {
    return null
  }
}

function markSeen() {
  if (!owner) return
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ owner, at: Date.now() }))
  } catch {
    /* private mode */
  }
}

/** How the user arrived, from when they were last here. */
export function arrivalFrom(last: number | null, now = Date.now()): Arrival {
  if (last === null) return { kind: 'first' }
  const away = now - last
  return away < RELOAD_MS ? { kind: 'reload' } : { kind: 'back', away }
}

let lastAngle = -1
function pickAngle(): string {
  let i = Math.floor(Math.random() * ANGLES.length)
  if (i === lastAngle) i = (i + 1) % ANGLES.length
  lastAngle = i
  return ANGLES[i]
}

/**
 * Greets on arrival: once the socket, user, data and last chat are ready after
 * the app opens, and again when the user returns after AWAY_MS. Reconnects
 * alone don't count as arriving.
 */
export function startGreeting(): () => void {
  useAgent.setState({ greeting: { text: '', streaming: false } })
  let due = true
  let hiddenAt = 0
  /** Decided when the app opens (from the last visit) or when they come back to the tab. */
  let arrival: Arrival | null = null
  // Her last chat should be read first, but never hold the welcome up for long.
  let waitedForChat = false

  const tryGreet = () => {
    if (!due) return
    const a = useAgent.getState()
    const hydrated = Object.values(useEntities.getState().hydrated).every(Boolean)
    if (a.connection !== 'open' || a.userId === null || !hydrated || a.turnId || a.awaitingTurn) return
    if (!a.transcriptReady && !waitedForChat) return
    arrival ??= arrivalFrom(lastSeen())
    const sent = greet(greetingDirective(facts(arrival), pickAngle(), recent()), (text) => {
      if (text.trim()) remember(text.trim().slice(0, 200))
    })
    if (sent) {
      due = false
      arrival = null
      markSeen()
    }
  }

  const chatWait = setTimeout(() => {
    waitedForChat = true
    tryGreet()
  }, 5000)
  // Keep "last here" fresh while they're here, so a reload can be told from a return.
  const seen = setInterval(() => document.visibilityState === 'visible' && markSeen(), 20_000)

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      markSeen()
      return
    }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) {
      due = true
      arrival = { kind: 'back', away: Date.now() - hiddenAt }
      // Back after a while: a fresh hello (a reminder she's showing stays put).
      if (useAgent.getState().line !== 'notice') useAgent.setState({ line: 'greeting', message: null })
      tryGreet()
    }
    hiddenAt = 0
  }

  const offA = useAgent.subscribe(tryGreet)
  const offE = useEntities.subscribe(tryGreet)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', markSeen)
  tryGreet()
  return () => {
    offA()
    offE()
    clearTimeout(chatWait)
    clearInterval(seen)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', markSeen)
  }
}
