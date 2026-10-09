// Whose event is this? Aelora scopes per-user events to that user's sockets,
// except that admin sockets (AELORA_ADMIN_EMAILS) also receive every other
// user's events, for moderation, in the same envelope. Actora is the user's own
// app, so it acts only on events that are its user's.
//   apply   – ours (or we're not an admin, so the server already scoped it)
//   drop    – someone else's, or unprovable on an admin socket and screen-driving
//   refetch – unprovable data change on an admin socket: reload our own copy instead

export type Verdict = 'apply' | 'drop' | 'refetch'

/** Events that drive the screen or Wendy's state: never act on one we can't prove is ours. */
const SCREEN = new Set(['agent_command', 'ui', 'mood', 'emotion', 'mindmap', 'persona.reloaded'])
/** Data events whose payload may not name its owner: our own copy can be refetched. */
const DATA = new Set(['task', 'goal', 'notification', 'vault', 'calendar'])

const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const ownerIn = (v: unknown) => (v && typeof v === 'object' ? str((v as { user_id?: unknown }).user_id) : null)

/** The user an event belongs to, if it says. */
export function ownerOf(frame: { userId?: unknown }, data: Record<string, unknown>): string | null {
  return (
    str(frame.userId) ?? // a server that labels its envelope
    str(data.userId) ??
    str(data.user_id) ??
    ownerIn(data.task) ??
    ownerIn(data.goal) ??
    ownerIn(data.notification) ??
    ownerIn(data.entry) ??
    ownerIn(data.event)
  )
}

export function eventVerdict(
  event: string,
  frame: { userId?: unknown },
  data: Record<string, unknown>,
  me: string | null,
  admin: boolean,
): Verdict {
  const owner = ownerOf(frame, data)
  if (owner) return me && owner === me ? 'apply' : 'drop'
  if (!admin) return 'apply'
  if (SCREEN.has(event) || event.startsWith('kb')) return 'drop'
  if (DATA.has(event)) return 'refetch'
  // Thread events name a conversation id, which only matches if it's ours;
  // a purge names nothing, so on an admin socket it can't be trusted.
  if (event === 'conversation') return data.type === 'conversation:purged' ? 'drop' : 'apply'
  return 'drop'
}
