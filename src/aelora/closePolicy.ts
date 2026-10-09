/**
 * What to do when the socket closes, keyed by close code (FRONTEND.md → "Close codes").
 *   4001 admin kick      → fatal, wait for a deliberate reload
 *   1008 unauthorized    → reauth: refresh the Supabase session, then retry once
 *   1013 server busy     → retry slowly (150-connection cap)
 *   anything else        → retry with exponential backoff + jitter
 */
type CloseAction = 'fatal' | 'reauth' | 'retry' | 'retry-slow'

export function closeAction(code: number): CloseAction {
  switch (code) {
    case 4001:
      return 'fatal'
    case 1008:
      return 'reauth'
    case 1013:
      return 'retry-slow'
    default:
      return 'retry'
  }
}

/** Exponential backoff with full jitter, capped. `attempt` starts at 0. */
export function backoffMs(attempt: number, slow = false, random = Math.random): number {
  const base = slow ? 4000 : 500
  const cap = slow ? 60_000 : 20_000
  const ceiling = Math.min(cap, base * 2 ** attempt)
  return Math.round(ceiling / 2 + random() * (ceiling / 2))
}
