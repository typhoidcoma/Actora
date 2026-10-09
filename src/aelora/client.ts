import { useVault, vault, type VaultEntry } from '../stores/vault'
import { config } from '../config'
import { useAgent } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { useUi } from '../stores/ui'
import { abortTurnOnDisconnect, sendChat, sendGreeting } from './chat'
import { startFinds } from '../finds/finds'
import { setTokenSource } from './http'
import type { ClientMessage, Notification, ServerFrame, Task } from './protocol'
import { request } from './request'
import { routeFrame, sendClientState } from './router'
import { useScheme } from '../stores/scheme'
import { toast, withUndo } from '../stores/toast'
import { dueLabel } from '../ui/format'
import { AeloraSocket, type WebSocketLike } from './socket'

let socket: AeloraSocket | null = null

interface StartOptions {
  getToken: () => Promise<string | null>
  onReauth?: () => Promise<void>
  /** The signed-in Supabase user; a socket that says it is anyone else is refused. */
  userId?: string
}

/**
 * Opens the Aelora connection and wires frames into the stores. Returns a stop
 * function synchronously, so an effect cleanup that runs before the async setup
 * finishes (React StrictMode) cancels it rather than racing it.
 */
export function startAelora(opts: StartOptions): () => void {
  let stopped = false
  let teardown: (() => void) | undefined
  void connect(opts, () => stopped).then((stop) => {
    // Stopped while connecting (e.g. StrictMode's mount/unmount/mount): tear down now.
    if (stopped) stop?.()
    else teardown = stop ?? undefined
  })
  return () => {
    stopped = true
    teardown?.()
  }
}

async function connect(opts: StartOptions, cancelled: () => boolean): Promise<(() => void) | null> {
  const Mock = config.mock ? (await import('./mock')).MockWebSocket : null
  if (cancelled()) return null
  setTokenSource(opts.getToken)

  const sock = new AeloraSocket({
    getToken: opts.getToken,
    onReauth: opts.onReauth,
    open: (token) =>
      Mock
        ? new Mock()
        : (new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(token)}`) as unknown as WebSocketLike),
  })
  socket = sock

  const offFrames = sock.subscribe((f) => {
    if (f.type === 'hello' && opts.userId && f.userId !== opts.userId) {
      return sock.giveUp(`signed in as ${opts.userId} but the server says ${String(f.userId)}`)
    }
    routeFrame(f, sock)
  })
  const offStatus = sock.onStatus((status) => {
    const prev = useAgent.getState()
    useAgent.setState({
      connection: status,
      phase: status === 'open' ? (prev.phase === 'offline' ? 'idle' : prev.phase) : 'offline',
    })
    if (status !== 'open') abortTurnOnDisconnect()
  })
  // Keep Wendy's idea of what's on screen in sync with what is actually on screen.
  const offUi = useUi.subscribe((s, prev) => {
    if (
      s.focus !== prev.focus ||
      s.chatOpen !== prev.chatOpen ||
      s.selected !== prev.selected ||
      s.reader !== prev.reader
    )
      sendClientState(sock)
  })

  // Wendy hears what her colour change became (guardrail notes) right away.
  const offScheme = useScheme.subscribe((s, p) => s.scheme !== p.scheme && sendClientState(sock))

  // CONVERSATIONS-CLIENT.md: re-open the active thread on return to the app,
  // which covers a phone that was backgrounded rather than disconnected.
  const onVisible = () => {
    const a = useAgent.getState()
    if (document.visibilityState !== 'visible' || sock.status !== 'open') return
    if (!a.conversationId || a.turnId || a.awaitingTurn) return
    void request(
      sock,
      { type: 'conversation.open', conversationId: a.conversationId, limit: 40 },
      'conversation.messages',
    )
  }
  document.addEventListener('visibilitychange', onVisible)

  sock.start()
  const offFinds = startFinds(sock)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    offFinds()
    offFrames()
    offStatus()
    offUi()
    offScheme()
    sock.stop()
    if (socket === sock) {
      socket = null
      setTokenSource(null)
    }
    entities.reset()
  }
}

export function reconnectAelora(): void {
  socket?.reconnect()
}

// ── User actions ───────────────────────────────────────────────────────────

export function chat(text: string): boolean {
  return socket ? sendChat(socket, text) : false
}

/** Older messages for the open thread (paging backwards; the page is prepended). */
export function loadEarlier(): void {
  const a = useAgent.getState()
  if (!socket || !a.conversationId || !a.history.hasMore || a.history.cursor === null) return
  void request(
    socket,
    { type: 'conversation.open', conversationId: a.conversationId, limit: 40, beforeSeq: a.history.cursor },
    'conversation.messages',
  )
}

/** Welcome line over system_chat (an app event, not a user turn). */
export function greet(directive: string, onDone?: (text: string) => void): boolean {
  return socket ? sendGreeting(socket, directive, onDone) : false
}

/** Fire-and-forget message on the live socket. */
export function send(msg: ClientMessage): boolean {
  return socket?.send(msg) ?? false
}

/** Request/reply on the live socket (correlated by reply type). */
export function ask<T extends ServerFrame = ServerFrame>(msg: ClientMessage, replyType: string): Promise<T | null> {
  return socket ? request<T>(socket, msg, replyType) : Promise.resolve(null)
}

const quote = (t: string) => `"${t.length > 40 ? `${t.slice(0, 38)}…` : t}"`

/** Patch a task on the server; optimistic, put back (and said so) if it's refused. */
async function patchTask(id: string, patch: Partial<Task>, failText: string): Promise<boolean> {
  const before = useEntities.getState().tasks[id]
  if (!socket || !before) return false
  useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: { ...before, ...patch } } }))
  const reply = await request(socket, { type: 'task.update', id, patch }, 'task.updated')
  if (!reply) {
    useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: before } }))
    toast.error(failText)
  }
  return !!reply
}

/** Move a task to another day (YYYY-MM-DD), with Undo. */
export async function rescheduleTask(id: string, due: string, undoable = true): Promise<void> {
  const before = useEntities.getState().tasks[id]
  if (!before || before.due_date === due) return
  const ok = await patchTask(id, { due_date: due }, `Couldn't move ${quote(before.title)}, so it's back.`)
  if (ok && undoable) {
    toast.show(`Moved ${quote(before.title)} to ${(dueLabel(due) ?? due).toLowerCase()}`, {
      undo: () => void patchTask(id, { due_date: before.due_date }, `Couldn't move it back.`),
    })
  }
}

/** Optimistically completes a task, with Undo; puts it back (and says so) if the server refuses. */
export async function completeTask(id: string): Promise<void> {
  const before = useEntities.getState().tasks[id]
  if (!socket || !before || before.status === 'done') return
  // Leave updated_at alone so the server's row always wins the upsert.
  const optimistic: Task = { ...before, status: 'done', completed_at: new Date().toISOString() }
  useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: optimistic } }))
  toast.show(`Done: ${quote(before.title)}`, { undo: () => void reopenTask(id, before.status) })
  const reply = await request(socket, { type: 'task.complete', id }, 'task.completed')
  if (!reply) {
    useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: before } }))
    toast.error(`Couldn't mark ${quote(before.title)} done, so it's back.`)
  }
}

/** A finished task back on the list. */
export function reopenTask(id: string, status: Task['status'] = 'todo'): Promise<boolean> {
  const t = useEntities.getState().tasks[id]
  return patchTask(
    id,
    { status: status === 'done' ? 'todo' : status, completed_at: null },
    `Couldn't reopen ${quote(t?.title ?? 'that')}.`,
  )
}

export async function markNotificationRead(id: string): Promise<void> {
  const before = useEntities.getState().notifications[id]
  if (!socket || !before || before.read_at) return
  const optimistic: Notification = { ...before, read_at: new Date().toISOString() }
  entities.upsertNotification(optimistic)
  const reply = await request(socket, { type: 'notification.read', id }, 'notification.marked')
  if (!reply) {
    entities.upsertNotification(before)
    toast.error(`Couldn't mark ${quote(before.title)} read.`)
  }
}

type Deletable = 'task' | 'goal' | 'event'

/** Take an item off screen now; returns how to put it back. */
function hideItem(kind: Deletable, id: string, occurrenceStart?: string): () => void {
  const before = useEntities.getState()
  if (kind === 'task') entities.removeTask(id)
  else if (kind === 'goal') entities.removeGoal(id)
  else if (occurrenceStart) {
    useEntities.setState((s) => ({
      events: Object.fromEntries(
        Object.entries(s.events).filter(([, e]) => !(e.id === id && e.occurrence_start === occurrenceStart)),
      ),
    }))
  } else entities.removeEvent(id)
  return () => {
    const now = useEntities.getState()
    if (kind === 'task' && before.tasks[id]) useEntities.setState({ tasks: { ...now.tasks, [id]: before.tasks[id] } })
    else if (kind === 'goal' && before.goals[id])
      useEntities.setState({ goals: { ...now.goals, [id]: before.goals[id] } })
    else if (kind === 'event') {
      const back = Object.entries(before.events).filter(
        ([, e]) => e.id === id && (!occurrenceStart || e.occurrence_start === occurrenceStart),
      )
      useEntities.setState({ events: { ...now.events, ...Object.fromEntries(back) } })
    }
  }
}

function sendDelete(kind: Deletable, id: string, occurrenceStart?: string) {
  if (!socket) return Promise.resolve(null)
  return kind === 'task'
    ? request(socket, { type: 'task.delete', id }, 'task.deleted')
    : kind === 'goal'
      ? request(socket, { type: 'goal.delete', id }, 'goal.deleted')
      : occurrenceStart
        ? // Cancelling one occurrence answers with the updated series.
          request(socket, { type: 'calendar.delete', id, occurrenceStart }, 'calendar.updated')
        : request(socket, { type: 'calendar.delete', id }, 'calendar.deleted')
}

/**
 * Delete a task, goal or calendar event (or one occurrence of a repeating
 * event). It disappears at once; the server only hears about it once the Undo
 * window closes, and it comes back (with a note) if the server refuses (a
 * Google-linked calendar can).
 */
export function deleteItem(kind: Deletable, id: string, title: string, occurrenceStart?: string): void {
  const restore = hideItem(kind, id, occurrenceStart)
  withUndo(
    `Deleted ${quote(title)}`,
    () => {},
    () =>
      void sendDelete(kind, id, occurrenceStart).then((reply) => {
        if (reply) return
        restore()
        toast.error(`Couldn't delete ${quote(title)}, so it's back.`)
      }),
    restore,
  )
}

// ── The Vault (what Wendy remembers) ──────────────────────────────────────────────

/** Load everything Wendy remembers (refreshed each time the Vault opens). */
export async function loadVault(): Promise<void> {
  vault.loading()
  const r = await ask<{ type: string; entries?: VaultEntry[] }>({ type: 'vault.list' }, 'vault.list')
  if (r && Array.isArray(r.entries)) vault.set(r.entries)
  else vault.failed()
}

/** Save a memory: a fact Wendy uses in conversation, mirrored to the vault (vault.remember). */
export async function rememberFact(content: string, category?: string): Promise<boolean> {
  const text = content.trim().slice(0, 500)
  if (!text) return false
  const r = await ask({ type: 'vault.remember', content: text, ...(category ? { category } : {}) }, 'vault.remembered')
  if (r) void loadVault()
  return r !== null
}

/** Forget a memory; optimistic, restored if the server says no. */
export async function forgetFact(id: string): Promise<boolean> {
  const before = useVault.getState().entries[id]
  vault.remove(id)
  const r = await ask({ type: 'vault.delete', id }, 'vault.deleted')
  if (!r && before) vault.upsert(before)
  return r !== null
}
