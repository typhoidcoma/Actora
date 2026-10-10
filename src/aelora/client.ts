import { useVault, vault, type VaultEntry } from '../stores/vault'
import { config } from '../config'
import { agent, useAgent } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { ui, useUi } from '../stores/ui'
import { abortTurnOnDisconnect, sendChat, sendGreeting } from './chat'
import { isFindsThread, startFinds } from '../finds/finds'
import { rememberMain } from './mainThread'
import { setTokenSource } from './http'
import type { ClientMessage, Goal, Notification, ServerFrame, Task } from './protocol'
import { request } from './request'
import { routeFrame, sendClientState } from './router'
import { useScheme } from '../stores/scheme'
import { flushPendingCommits, toast, withUndo } from '../stores/toast'
import { capture } from '../stores/captures'
import { sessions, useSession } from '../stores/session'
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
    if (s.focus !== prev.focus || s.chatOpen !== prev.chatOpen || s.selected !== prev.selected) sendClientState(sock)
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
    // Deletes still inside their Undo window go now, on this user's socket.
    flushPendingCommits()
    sock.stop()
    if (socket === sock) {
      socket = null
      setTokenSource(null)
    }
    entities.reset()
    agent.resetForUser()
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
let loadingEarlier = false
export function loadEarlier(): void {
  const a = useAgent.getState()
  // One page at a time: a double tap must not fetch the same page twice.
  if (loadingEarlier || !socket || !a.conversationId || !a.history.hasMore || a.history.cursor === null) return
  loadingEarlier = true
  void request(
    socket,
    { type: 'conversation.open', conversationId: a.conversationId, limit: 40, beforeSeq: a.history.cursor },
    'conversation.messages',
  ).finally(() => {
    loadingEarlier = false
  })
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

/** A reply about this item: the entity it carries, or its bare id (deletes). */
const about =
  (id: string) =>
  (f: Record<string, unknown>): boolean => {
    if (f.id === id) return true
    for (const k of ['task', 'goal', 'event', 'notification', 'session']) {
      const v = f[k] as { id?: unknown } | undefined
      if (v && v.id === id) return true
    }
    return false
  }

const quote = (t: string) => `"${t.length > 40 ? `${t.slice(0, 38)}…` : t}"`

/** Patch a task on the server; optimistic, put back (and said so) if it's refused. */
async function patchTask(id: string, patch: Partial<Task>, failText: string): Promise<boolean> {
  const before = useEntities.getState().tasks[id]
  if (!socket || !before) return false
  useEntities.setState((s) => ({ tasks: { ...s.tasks, [id]: { ...before, ...patch } } }))
  const reply = await request(socket, { type: 'task.update', id, patch }, 'task.updated', { match: about(id) })
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
    toast.show(`Moved ${quote(before.title)} to ${dayWords(due)}`, {
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
  const reply = await request(socket, { type: 'task.complete', id }, 'task.completed', { match: about(id) })
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
  const reply = await request(socket, { type: 'notification.read', id }, 'notification.marked', { match: about(id) })
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
    ? request(socket, { type: 'task.delete', id }, 'task.deleted', { match: about(id) })
    : kind === 'goal'
      ? request(socket, { type: 'goal.delete', id }, 'goal.deleted', { match: about(id) })
      : occurrenceStart
        ? // Cancelling one occurrence answers with the updated series.
          request(socket, { type: 'calendar.delete', id, occurrenceStart }, 'calendar.updated', { match: about(id) })
        : request(socket, { type: 'calendar.delete', id }, 'calendar.deleted', { match: about(id) })
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

/** Achieved / paused / active again; optimistic, with Undo. */
export async function setGoalStatus(id: string, status: Goal['status']): Promise<void> {
  const before = useEntities.getState().goals[id]
  if (!socket || !before || before.status === status) return
  const write = async (to: Goal['status'], quiet = false) => {
    entities.upsertGoal({ ...before, status: to })
    const reply = await request(socket!, { type: 'goal.update', id, patch: { status: to } }, 'goal.updated', {
      match: about(id),
    })
    if (!reply) {
      entities.upsertGoal(before)
      if (!quiet) toast.error(`Couldn't update ${quote(before.title)}, so it's back.`)
    }
    return !!reply
  }
  const words = { completed: 'Achieved', paused: 'Paused', active: 'Back on' }[status]
  if (await write(status)) {
    toast.show(`${words}: ${quote(before.title)}`, { undo: () => void write(before.status, true) })
  }
}

/** Mark a task as being worked on now. */
export function startTask(id: string): Promise<boolean> {
  const t = useEntities.getState().tasks[id]
  return patchTask(id, { status: 'in_progress' }, `Couldn't start ${quote(t?.title ?? 'that')}.`)
}

/**
 * Snooze a reminder: it's marked read now and comes back as a new one at
 * `when` (Aelora has no snooze of its own, and reminders can't be edited).
 */
export async function snoozeNotification(id: string, when: Date): Promise<void> {
  const n = useEntities.getState().notifications[id]
  if (!socket || !n) return
  const reply = await request(
    socket,
    {
      type: 'notification.create',
      title: n.title,
      ...(n.body ? { body: n.body } : {}),
      scheduledFor: when.toISOString(),
    },
    'notification.created',
  )
  if (!reply) return void toast.error(`Couldn't snooze ${quote(n.title)}.`)
  const created = (reply as { notification?: Notification }).notification
  if (created) entities.upsertNotification(created)
  await markNotificationRead(id)
  toast.show(`Reminder set for ${whenLabel(when)}`)
}

const whenLabel = (d: Date) => {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return time
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow, ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`
}

// ── Past chats ──────────────────────────────────────────────────────────────────────

export interface ThreadSummary {
  id: string
  title: string | null
  messageCount: number
  lastMessageAt: string | null
  startedAt: string
}

/** One page of the user's threads, newest first (the Fun finds thread left out). */
export async function listThreads(before?: string): Promise<{ threads: ThreadSummary[]; next: string | null } | null> {
  if (!socket) return null
  const r = await request<{ type: string; conversations?: ThreadSummary[]; nextBefore?: string | null }>(
    socket,
    { type: 'conversation.list', limit: 30, ...(before ? { before } : {}) },
    'conversation.list',
  )
  if (!r) return null
  return { threads: (r.conversations ?? []).filter((c) => !isFindsThread(c.id)), next: r.nextBefore ?? null }
}

/** Make a past thread the conversation, load it, and open the chat. */
export function openThread(id: string): void {
  if (!socket) return
  rememberMain(id)
  useAgent.setState({ conversationId: id, messages: [], history: { hasMore: false, cursor: null } })
  void request(socket, { type: 'conversation.open', conversationId: id, limit: 40 }, 'conversation.messages')
  ui.openChat()
}

/** A clean slate: the next message starts a new thread. */
export function newThread(open = true): void {
  rememberMain(null)
  useAgent.setState({ conversationId: null, messages: [], history: { hasMore: false, cursor: null } })
  if (open) ui.openChat()
}

export async function deleteThread(id: string): Promise<boolean> {
  if (!socket) return false
  const r = await request(socket, { type: 'conversation.delete', conversationId: id }, 'conversation.deleted', {
    match: (f) => f.conversationId === id,
  })
  if (!r) toast.error("Couldn't delete that chat.")
  return !!r
}

/** Every overdue open task onto today, in one go, with one Undo. */
export async function moveOverdueToToday(today: string): Promise<void> {
  const late = Object.values(useEntities.getState().tasks).filter(
    (t) => t.status !== 'done' && t.status !== 'skipped' && t.due_date !== null && t.due_date < today,
  )
  if (!late.length) return
  const was = late.map((t) => [t.id, t.due_date] as const)
  const results = await Promise.all(
    late.map((t) => patchTask(t.id, { due_date: today }, `Couldn't move ${quote(t.title)}.`)),
  )
  const moved = results.filter(Boolean).length
  if (!moved) return
  toast.show(`Moved ${moved} overdue task${moved === 1 ? '' : 's'} to today`, {
    undo: () => void Promise.all(was.map(([id, due]) => patchTask(id, { due_date: due }, `Couldn't move it back.`))),
  })
}

/** Start a focus session on something (Aelora session.start). */
export async function startFocus(anchor: string | null): Promise<void> {
  if (!socket) return
  const reply = await request<{ type: string; session?: unknown }>(
    socket,
    { type: 'session.start', ...(anchor ? { anchor: anchor.slice(0, 200) } : {}) },
    'session.started',
  )
  if (!reply?.session) return void toast.error("Couldn't start a focus session.")
  sessions.apply(reply.session)
  toast.show(anchor ? `Focusing on ${quote(anchor)}` : 'Focus session started')
}

/** End the running focus session, and say how long it was. */
export async function endFocus(): Promise<void> {
  const cur = useSession.getState().active
  if (!socket || !cur) return
  const reply = await request<{ type: string; session?: unknown }>(
    socket,
    { type: 'session.end', id: cur.id },
    'session.ended',
    { match: about(cur.id) },
  )
  if (!reply?.session) return void toast.error("Couldn't end the session.")
  sessions.apply(reply.session)
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(cur.started_at)) / 60_000))
  toast.show(`Focused for ${mins} min. Nice.`)
}

/** Quick capture: a thought straight onto the task list (queued if offline). */
export function captureTask(title: string): Promise<void> {
  const a = useAgent.getState()
  return capture(socket, a.connection === 'open', a.userId, title)
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

/** Undo a "Noted: …": find the memory Wendy just saved by its words and forget it. */
export async function forgetByText(text: string): Promise<void> {
  await loadVault()
  const want = text.trim().toLowerCase()
  const entries = Object.values(useVault.getState().entries).filter((e) => e.content.trim())
  const norm = (e: VaultEntry) => e.content.trim().toLowerCase()
  const newest = (a: VaultEntry, b: VaultEntry) => (b.created_at ?? '').localeCompare(a.created_at ?? '')
  // The one just saved: an exact match, else the newest that contains these words.
  const hit =
    entries.find((e) => norm(e) === want) ??
    entries.filter((e) => norm(e).includes(want) || want.includes(norm(e))).sort(newest)[0]
  if (hit && (await forgetFact(hit.id))) toast.show('Forgotten')
  else toast.error("Couldn't find that to forget. It's in the Vault if you want to remove it there.")
}

/** Forget a memory; optimistic, restored if the server says no. */
export async function forgetFact(id: string): Promise<boolean> {
  const before = useVault.getState().entries[id]
  vault.remove(id)
  const r = await ask({ type: 'vault.delete', id }, 'vault.deleted')
  if (!r && before) vault.upsert(before)
  return r !== null
}

/** "today", "tomorrow", or the date as written ("Mon, Oct 12"). */
function dayWords(due: string): string {
  const label = dueLabel(due) ?? due
  return /^(today|tomorrow|yesterday)$/i.test(label) ? label.toLowerCase() : label
}
