const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export const clockTime = (d: Date | string | number) => timeFmt.format(new Date(d))

/** "in 42m", "in 3h 10m", "now". */
export function until(ms: number): string {
  if (ms <= 0) return 'now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 24) return rest ? `in ${h}h ${rest}m` : `in ${h}h`
  const d = Math.round(h / 24)
  return `in ${d}d`
}

/** Big tile readout for a countdown: value + unit. */
export function countdownParts(ms: number): { value: number; unit: string } {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return { value: m, unit: 'min' }
  const h = m / 60
  if (h < 24) return { value: Math.round(h * 10) / 10, unit: 'hr' }
  return { value: Math.round(h / 24), unit: 'days' }
}

export function ago(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function dayLabel(d: Date | string, now = new Date()): string {
  const date = new Date(d)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(date) - startOf(now)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return dayFmt.format(date)
}

export function dueLabel(due: string | null): string | null {
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date < today) return 'Overdue'
  return dayLabel(date)
}

/** "list_events" → "List events" */
export const toolLabel = (name: string | null) =>
  name ? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : ''

/** A complete date (four-digit year), today or later, and not absurdly far out. */
export function validDay(d: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today) return false
  return Number(d.slice(0, 4)) <= Number(today.slice(0, 4)) + 10
}
