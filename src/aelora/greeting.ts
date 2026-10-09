import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { useSky } from '../weather/sky'
import { greet } from './client'

// Wendy's welcome line, written fresh by Wendy every time the user arrives:
// on each app open, and again when they come back after a while. Nothing is
// cached or templated; the line stays empty (the orb thinks) until her words
// stream in. Generated over system_chat (Aelora's path for app-event prompts:
// no history, mood or fact side effects).

/** Away this long, coming back counts as arriving again. */
const AWAY_MS = 20 * 60_000
const HISTORY_KEY = 'actora.greeting.recent.v1'
const HISTORY = 4

type Part = 'morning' | 'afternoon' | 'evening' | 'night'

export function partOfDay(d = new Date()): Part {
  const h = d.getHours()
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'
}

export interface Facts {
  part: Part
  weekday: string
  name: string | null
  weather: string | null
  openTasks: number
  topTask: string | null
  nextEvent: { title: string; mins: number } | null
  unread: number
}

function facts(now = Date.now()): Facts {
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
    unread: Object.values(notifications).filter((n) => !n.read_at).length,
  }
}

/**
 * Directions for the opener, not words: each greeting gets a different angle
 * so two in a row never feel the same. Wendy writes every word herself.
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
  const lines = [
    'APP EVENT: the user just arrived in the Actora app. Welcome them as Wendy with a fresh, fun opener.',
    'One or two short sentences, at most 30 words. Plain text only: no markdown, no lists, no emoji. At most one question.',
    `Angle for this greeting: ${angle}.`,
    'Make it feel alive and specific to right now, never generic. Mention at most one practical thing, and only if it really matters.',
    `Context: ${f.weekday} ${f.part}.${f.weather ? ` Weather: ${f.weather}.` : ''}`,
  ]
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

let lastAngle = -1
function pickAngle(): string {
  let i = Math.floor(Math.random() * ANGLES.length)
  if (i === lastAngle) i = (i + 1) % ANGLES.length
  lastAngle = i
  return ANGLES[i]
}

/**
 * Greets on arrival: once the socket, user and data are ready after the app
 * opens, and again when the user returns after AWAY_MS. Reconnects alone
 * don't count as arriving.
 */
export function startGreeting(): () => void {
  useAgent.setState({ greeting: { text: '', streaming: false } })
  let due = true
  let hiddenAt = 0

  const tryGreet = () => {
    if (!due) return
    const a = useAgent.getState()
    const hydrated = Object.values(useEntities.getState().hydrated).every(Boolean)
    if (a.connection !== 'open' || a.userId === null || !hydrated || a.turnId || a.awaitingTurn) return
    const sent = greet(greetingDirective(facts(), pickAngle(), recent()), (text) => {
      if (text.trim()) remember(text.trim().slice(0, 200))
    })
    if (sent) due = false
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) {
      due = true
      // Back after a while: a fresh hello (a reminder she's showing stays put).
      if (useAgent.getState().line !== 'notice') useAgent.setState({ line: 'greeting', message: null })
      tryGreet()
    }
    hiddenAt = 0
  }

  const offA = useAgent.subscribe(tryGreet)
  const offE = useEntities.subscribe(tryGreet)
  document.addEventListener('visibilitychange', onVisibility)
  tryGreet()
  return () => {
    offA()
    offE()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
