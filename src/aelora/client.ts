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
import { AeloraSocket, type WebSocketLike } from './socket'

let socket: AeloraSocket | null = null

interface StartOptions {
  getToken: () => Promise<string | null>
  onReauth?: () => Promise<void>
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

  const offFrames = sock.subscribe((f) => routeFrame(f, sock))
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

/** Move a task to another day (YYYY-MM-DD); optimistic with rollback. */
export async function rescheduleTask(id: string, due: string): Promise<void> {
  const before = useEntities.getState().tasks[id]
  if (!socket || !before || before.due_date === due) return
  useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: { ...before, due_date: due } } }))
  const reply = await request(socket, { type: 'task.update', id, patch: { due_date: due } }, 'task.updated')
  if (!reply) useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: before } }))
}

/** Optimistically completes a task; rolls back if the server doesn't confirm. */
export async function completeTask(id: string): Promise<void> {
  const before = useEntities.getState().tasks[id]
  if (!socket || !before || before.status === 'done') return
  // Leave updated_at alone so the server's row always wins the upsert.
  const optimistic: Task = { ...before, status: 'done', completed_at: new Date().toISOString() }
  useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: optimistic } }))
  const reply = await request(socket, { type: 'task.complete', id }, 'task.completed')
  if (!reply) useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: before } }))
}

export async function markNotificationRead(id: string): Promise<void> {
  const before = useEntities.getState().notifications[id]
  if (!socket || !before || before.read_at) return
  const optimistic: Notification = { ...before, read_at: new Date().toISOString() }
  entities.upsertNotification(optimistic)
  const reply = await request(socket, { type: 'notification.read', id }, 'notification.marked')
  if (!reply) entities.upsertNotification(before)
}
