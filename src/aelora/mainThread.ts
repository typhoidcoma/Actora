// The user's own conversation (as opposed to the "Fun finds" thread), kept per
// user. The server's conversation.active is simply its most recent thread, so
// after a finds hunt it points at the finds thread; and a chat sent without a
// conversationId lands there too. Remembering the main thread lets every turn
// address it explicitly, so the two never cross.

const KEY = 'actora.main.thread.v1'

let owner: string | null | undefined

/** Called on every hello: whose thread this is. */
export function adoptMainUser(userId: string | null): void {
  owner = userId
}

export function recallMain(): string | null {
  if (owner === undefined) return null
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { id?: string; owner?: string | null } | null
    return v?.id && v.owner === owner ? v.id : null
  } catch {
    return null
  }
}

export function rememberMain(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, JSON.stringify({ id, owner }))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the server's active thread is the fallback */
  }
}
