import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { useSky } from '../weather/sky'
import { greet } from './client'

// Wendy's welcome line. Generated over system_chat (Aelora's sanctioned path for
// app-event prompts: no history, mood or fact side effects), cached so reopening
// the app shows it instantly, and only regenerated after 30 min away or when the
// part of the day changes. A local line covers connecting and offline.

const CACHE_KEY = 'actora.greeting.v1'
const STALE_MS = 30 * 60_000

type Part = 'morning' | 'afternoon' | 'evening' | 'night'

export function partOfDay(d = new Date()): Part {
  const h = d.getHours()
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'
}

interface Facts {
  part: Part
  name: string | null
  weather: string | null
  openTasks: number
  topTask: string | null
  nextEvent: { title: string; mins: number; at: string } | null
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
    name: useAgent.getState().userName,
    weather:
      sky.source === 'live' && sky.temp !== null ? `${Math.round(sky.temp)}°${sky.unit}, ${words[sky.kind]}` : null,
    openTasks: open.length,
    topTask: open[0]?.title ?? null,
    nextEvent: next
      ? {
          title: next.title,
          mins: Math.round((Date.parse(next.start_time) - now) / 60_000),
          at: new Date(next.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        }
      : null,
    unread: Object.values(notifications).filter((n) => !n.read_at).length,
  }
}

/** Shown instantly while Wendy's own line is on its way (or when offline). */
export function localGreeting(f = facts()): string {
  const hello = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Hey' }[f.part]
  const who = f.name ? `${hello}, ${f.name}.` : `${hello}.`
  const bits: string[] = []
  if (f.openTasks) bits.push(`${f.openTasks} thing${f.openTasks === 1 ? '' : 's'} on your list`)
  if (f.nextEvent && f.nextEvent.mins < 24 * 60) bits.push(`${f.nextEvent.title} at ${f.nextEvent.at}`)
  if (!bits.length) return `${who} Nothing pressing — want to plan something?`
  return `${who} ${bits.join(', and ')}.`
}

export function greetingDirective(f = facts()): string {
  const lines = [
    'APP EVENT: the user just opened the Actora home screen. Greet them as Wendy in one or two short, warm sentences (at most 30 words).',
    'Lead with what matters most right now. Plain text only: no markdown, no lists, no emoji. Do not ask more than one question.',
    `Context: it is ${f.part}.`,
  ]
  if (f.name) lines.push(`Their name is ${f.name}.`)
  if (f.weather) lines.push(`Weather: ${f.weather}.`)
  lines.push(
    `Open tasks: ${f.openTasks}${f.topTask ? ` (top: "${f.topTask}")` : ''}.`,
    f.nextEvent ? `Next event: "${f.nextEvent.title}" in ${f.nextEvent.mins} minutes.` : 'No upcoming events.',
    `Unread reminders: ${f.unread}.`,
  )
  return lines.join('\n')
}

interface Cached {
  text: string
  at: number
  part: Part
  owner?: string | null
}

// The cached line belongs to one signed-in user; it is only used once hello
// confirms that user (adoptGreetingUser), so a shared device never shows the
// previous person's greeting.
let owner: string | null | undefined

function readCache(): Cached | null {
  if (owner === undefined) return null
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null
    return c && c.owner === owner ? c : null
  } catch {
    return null
  }
}

function writeCache(text: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ text, at: Date.now(), part: partOfDay(), owner }))
  } catch {
    /* private mode */
  }
}

export function shouldRegenerate(c: Cached | null, now = Date.now()): boolean {
  return !c || now - c.at > STALE_MS || c.part !== partOfDay(new Date(now))
}

/** Called on every hello: show this user's cached line, or drop another user's. */
export function adoptGreetingUser(userId: string | null): void {
  if (owner === userId) return
  owner = userId
  const cached = readCache()
  if (cached) {
    useAgent.setState({ greeting: { text: cached.text, streaming: false } })
    return
  }
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* private mode */
  }
}

/** Seed the line locally, then ask Wendy once the socket, user and data are ready. */
export function startGreeting(): () => void {
  useAgent.setState({ greeting: { text: localGreeting(), streaming: false } })
  let asked = false

  const tryAsk = () => {
    if (asked) return
    const a = useAgent.getState()
    const hydrated = Object.values(useEntities.getState().hydrated).every(Boolean)
    if (a.connection !== 'open' || a.userId === null || !hydrated) return
    asked = true
    const cached = readCache()
    if (!shouldRegenerate(cached)) return
    // Refresh the local line with real counts while Wendy writes hers.
    if (!cached) useAgent.setState({ greeting: { text: localGreeting(), streaming: false } })
    greet(greetingDirective(), (text) => text.trim() && writeCache(text.trim()))
  }
  const offA = useAgent.subscribe(tryAsk)
  const offE = useEntities.subscribe(tryAsk)
  tryAsk()
  return () => {
    offA()
    offE()
  }
}
