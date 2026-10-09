import { config } from '../config'
import { useAgent } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { useUi } from '../stores/ui'
import { abortTurnOnDisconnect, sendChat } from './chat'
import type { Notification, Task } from './protocol'
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
    teardown = stop ?? undefined
  })
  return () => {
    stopped = true
    teardown?.()
  }
}

async function connect(opts: StartOptions, cancelled: () => boolean): Promise<(() => void) | null> {
  const Mock = config.mock ? (await import('./mock')).MockWebSocket : null
  if (cancelled()) return null

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
    if (s.focus !== prev.focus || s.chatOpen !== prev.chatOpen) sendClientState(sock)
  })

  sock.start()
  return () => {
    offFrames()
    offStatus()
    offUi()
    sock.stop()
    if (socket === sock) socket = null
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
