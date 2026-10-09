import {
  adoptFindsUser,
  forgetFindsThread,
  handleFindsFrame,
  hunt,
  isFindsThread,
  setFinds,
  unseenCount,
  useFinds,
} from '../finds/finds'
import { adoptGreetingUser } from './greeting'
import { adoptMainUser, recallMain, rememberMain } from './mainThread'
import { CATEGORIES, useVault, vault, type VaultEntry } from '../stores/vault'
import { pending, usePending, waiting } from '../stores/pending'
import { refreshGoogle } from '../google/google'
import { flushCaptures } from '../stores/captures'
import { actOption, sayOption } from '../options/types'
import { notifyInBackground, resubscribe } from '../push/push'
import { agent, useAgent, type Reaction } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { scoreItems } from '../priority/score'
import { optionsStore } from '../stores/options'
import { mergePriorities, priorityStore, usePriorityStore } from '../stores/priority'
import { usePush } from '../stores/push'
import {
  APP_TO_TILE,
  contextKeyOf,
  TILE_IDS,
  openAppsFor,
  ui,
  useUi,
  type ItemKind,
  type ThemeMode,
  type TileId,
} from '../stores/ui'
import { handleChatFrame, loadTranscript } from './chat'
import {
  isEventFrame,
  PLUTCHIK,
  type AgentCommand,
  type CalendarOccurrence,
  type EmotionVector,
  type Goal,
  type MoodState,
  type Notification,
  type ServerFrame,
  type Task,
  type TranscriptMessage,
} from './protocol'
import { request } from './request'
import { describeScheme, type SchemeInput } from '../color/scheme'
import { resetColors, setColors, useScheme } from '../stores/scheme'
import type { FrameBus } from './socket'
import { actionArgs, AVAILABLE_ACTIONS, strayAction } from './actions'
import { eventVerdict } from './owner'

/**
 * ui_action names we accept; advertised in client_state so Wendy can drive the
 * whole screen (WEBSOCKET.md → client-advertised catalogs). Playbook: docs/wendy-ui.md.
 *   priorities.set {items: [{kind, id, why?}]}             rank the three cards (30 min)
 *   home.show                                              close everything: back to the cards
 *   card.open / item.focus {kind, id} · card.close         one item in its own panel
 *   list.open / tile.focus {tile, kind?, id?} · tile.close full Tasks/Calendar/Goals/Inbox list
 *                                                          (with kind+id: that row highlighted)
 *   reader.open · reader.close                             her full answer, in the reader
 *   finds.open · finds.close · finds.refresh               box 4: the fun finds / hunt for more
 *   finds.focus {id}                                       open the finds with one picked
 *   finds.set {items: [{title, blurb, why, url, image, source, tag}]}   the fun finds cards
 *   vault.open · vault.close                               the Vault: what she knows about the user
 *   vault.search {query?, category?}                       open the Vault filtered
 *   options.set {options: [{label, say}]}                  replace the tap options here
 *   chat.open · chat.close · reply.show · reply.hide
 *   theme.set {mode: auto|day|dusk} · voice.listen · push.offer
 *   colors.set {seed?, harmony?, accent?, urgent?, mid?, calm?, task?, event?, reminder?, goal?,
 *               wendy?, finds?, neutral?, ambient?: hex[], orb?: hex[], hours?}   restyle the app
 *   colors.reset                                           back to the brand palette
 * Colours pass through the scheme engine (src/color/scheme.ts): contrast, gamut,
 * meaning and separation guardrails; what it changed comes back in screen.colors.notes.
 */
export { AVAILABLE_ACTIONS } from './actions'

/** Reaction states the orb can play (AVATAR-INTEGRATION.md DEFAULT_STATES). */
const ANIMATIONS = [
  'idle',
  'happy',
  'laughing',
  'surprised',
  'sad',
  'angry',
  'disgusted',
  'fearful',
  'confused',
  'thinking',
  'skeptical',
] as const

/** What the user is looking at, so a persona that reads the ui blob can refer to it. */
function screen() {
  const u = useUi.getState()
  const e = useEntities.getState()
  // The open list's rows, with ids so she can point at one (card.open / list.open).
  const visible =
    u.focus === 'tasks'
      ? Object.values(e.tasks)
          .filter((t) => t.status !== 'done')
          .map((t) => ({ kind: 'task', id: t.id, title: t.title }))
      : u.focus === 'goals'
        ? Object.values(e.goals).map((g) => ({ kind: 'goal', id: g.id, title: g.title }))
        : u.focus === 'calendar'
          ? Object.values(e.events).map((x) => ({ kind: 'event', id: x.id, title: x.title }))
          : u.focus === 'inbox'
            ? Object.values(e.notifications).map((n) => ({ kind: 'notification', id: n.id, title: n.title }))
            : []
  const p = usePriorityStore.getState()
  const priorities = mergePriorities(
    scoreItems(e, Date.now()),
    p.wendy,
    p.pushed && p.pushed.until > Date.now() ? p.pushed.entries : null,
  ).map((i) => ({ key: i.key, title: i.title, why: i.why }))
  const f = useFinds.getState()
  const box4 = {
    type: 'fun finds',
    open: u.finds,
    picked: u.find,
    count: f.items.length,
    unseen: unseenCount(f),
    items: f.items.map((x) => ({ id: x.id, title: x.title })),
  }
  const v = useVault.getState()
  return {
    context: contextKeyOf(u),
    focus: u.focus,
    selected: u.selected,
    chat: u.chatOpen,
    reader: u.reader,
    vault: u.vault ? { open: true, query: v.query, category: v.category } : { open: false },
    theme: u.theme,
    reminders: usePush.getState().status,
    // Prepared actions the user hasn't answered yet (they approve with a tap, in a later turn).
    pending: waiting(usePending.getState().items).map((p) => ({ id: p.id, kind: p.kind })),
    priorities,
    box4,
    colors: describeScheme(useScheme.getState().scheme, useScheme.getState().source),
    visible: visible.slice(0, 12),
  }
}

export function sendClientState(bus: FrameBus): void {
  bus.send({
    type: 'client_state',
    openApps: openAppsFor(useUi.getState()),
    focus: contextKeyOf(useUi.getState()),
    // The whole ui object every time: the server replaces its copy per frame, and
    // a frame without availableActions would have every action refused.
    // client: 'actora' selects the Actora playbook server-side.
    ui: { client: 'actora', availableActions: [...AVAILABLE_ACTIONS], animations: [...ANIMATIONS], screen: screen() },
    timestamp: new Date().toISOString(),
  })
}

function refreshCalendar(bus: FrameBus) {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from.getTime() + 14 * 86_400_000)
  return request(bus, { type: 'calendar.list', from: from.toISOString(), to: to.toISOString() }, 'calendar.list')
}

/** Post-hello sequence (FRONTEND.md → "Reconnect checklist"). Different reply types may run concurrently. */
function bootstrap(bus: FrameBus): void {
  bus.send({ type: 'tz.set', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  sendClientState(bus)
  void request(bus, { type: 'notification.list', deliveredOnly: false }, 'notification.list')
  void request(bus, { type: 'task.list' }, 'task.list')
  void request(bus, { type: 'goal.list' }, 'goal.list')
  void refreshCalendar(bus)
  void resubscribe()
  void refreshGoogle()
  void flushCaptures(bus)
}

let calendarRefetch: ReturnType<typeof setTimeout> | undefined
function scheduleCalendarRefetch(bus: FrameBus): void {
  clearTimeout(calendarRefetch)
  calendarRefetch = setTimeout(() => void refreshCalendar(bus), 400)
}

function applyCalendarEvent(bus: FrameBus, e: CalendarOccurrence | undefined): void {
  if (!e?.id) return
  // A series expands into many occurrences server-side; refetch rather than guess.
  if (e.rrule || e.is_recurring) scheduleCalendarRefetch(bus)
  else entities.upsertEvent(e)
}

function pickEmotion(data: Record<string, unknown>): EmotionVector {
  const out: EmotionVector = {}
  for (const k of PLUTCHIK) {
    const v = data[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v))
  }
  return out
}

function runCommand(cmd: AgentCommand | undefined): void {
  if (!cmd || typeof cmd !== 'object') return
  switch (cmd.type) {
    case 'open_app': {
      const target = APP_TO_TILE[cmd.id]
      if (target === 'chat') ui.openChat()
      else if (target === 'vault') ui.openVault()
      else if (target) ui.focus(target)
      return
    }
    case 'close_app': {
      const target = APP_TO_TILE[cmd.id]
      const s = useUi.getState()
      if (target === 'chat' && s.chatOpen) ui.closeChat()
      else if (target === 'vault' && s.vault) ui.closeVault()
      else if (target && s.focus === target) ui.focus(null)
      return
    }
    case 'sequence':
      for (const step of cmd.steps ?? []) runCommand(step)
      return
    case 'ui_action':
      runUiAction(cmd.action, cmd.args ?? {})
      return
    case 'avatar.react': {
      const reaction: Reaction = {
        bus: cmd.bus,
        state: cmd.state,
        intensity: typeof cmd.intensity === 'number' ? cmd.intensity : 0.6,
        holdMs: typeof cmd.holdMs === 'number' ? cmd.holdMs : 1500,
        at: performance.now(),
      }
      useAgent.setState({ reaction })
      return
    }
  }
}

const ITEM_KINDS = new Set<ItemKind>(['task', 'goal', 'event', 'notification'])
const THEMES = new Set<ThemeMode>(['auto', 'day', 'dusk'])
const TILES = new Set<TileId>(TILE_IDS)

function itemExists(kind: ItemKind, id: string): boolean {
  const e = useEntities.getState()
  if (kind === 'task') return !!e.tasks[id]
  if (kind === 'goal') return !!e.goals[id]
  if (kind === 'notification') return !!e.notifications[id]
  return Object.values(e.events).some((x) => x.id === id)
}

export function runUiAction(action: string, args: Record<string, unknown>): void {
  switch (action) {
    case 'priorities.set': {
      const items = Array.isArray(args.items) ? args.items : []
      const entries = items
        .map((o) => (o && typeof o === 'object' ? (o as { kind?: unknown; id?: unknown; why?: unknown }) : null))
        .filter((o): o is { kind: ItemKind; id: string; why?: unknown } => {
          // Only items that exist here: the server passes args through unchecked.
          return (
            !!o &&
            ITEM_KINDS.has(o.kind as ItemKind) &&
            typeof o.id === 'string' &&
            itemExists(o.kind as ItemKind, o.id)
          )
        })
        .slice(0, 3)
        .map((o) => ({
          key: `${o.kind}:${o.id}`,
          why: typeof o.why === 'string' && o.why.trim() ? o.why.trim().slice(0, 60) : undefined,
        }))
      if (entries.length) priorityStore.push(entries)
      else priorityStore.clearPushed()
      return
    }
    case 'home.show':
      return ui.closeAll()
    case 'list.open':
    case 'tile.focus': {
      // With an item, show it highlighted in its list; otherwise just the list.
      if (
        ITEM_KINDS.has(args.kind as ItemKind) &&
        typeof args.id === 'string' &&
        itemExists(args.kind as ItemKind, args.id)
      ) {
        return ui.reveal({ kind: args.kind as ItemKind, id: args.id })
      }
      if (TILES.has(args.tile as TileId)) ui.focus(args.tile as TileId)
      return
    }
    case 'tile.close':
      return ui.focus(null)
    case 'card.close':
      if (useUi.getState().selected) ui.select(null)
      return
    case 'reader.open':
      return ui.openReader()
    case 'finds.open':
      return ui.openFinds()
    case 'finds.close':
      return ui.closeFinds()
    case 'finds.focus':
      if (typeof args.id === 'string' && useFinds.getState().items.some((x) => x.id === args.id)) {
        ui.openFinds()
        ui.selectFind(args.id)
      }
      return
    case 'finds.refresh':
      return hunt()
    case 'reader.close':
      return ui.closeReader()
    case 'chat.open':
      return ui.openChat()
    case 'chat.close':
      return ui.closeChat()
    case 'card.open':
    case 'item.focus':
      if (
        ITEM_KINDS.has(args.kind as ItemKind) &&
        typeof args.id === 'string' &&
        itemExists(args.kind as ItemKind, args.id)
      ) {
        ui.open({ kind: args.kind as ItemKind, id: args.id })
      }
      return
    case 'options.set': {
      const list = Array.isArray(args.options) ? args.options : []
      const options = list
        .map((o) => (o && typeof o === 'object' ? (o as { label?: unknown; say?: unknown }) : null))
        .filter((o): o is { label: unknown; say?: unknown } => !!o && typeof o.label === 'string' && !!o.label.trim())
        .slice(0, 5)
        .map((o) =>
          sayOption(
            String(o.label),
            (typeof o.say === 'string' && o.say.trim() ? o.say.trim() : String(o.label)).slice(0, 160),
            'pushed',
          ),
        )
      // 2–5 answers; a lone option isn't a choice, so keep the current ones instead.
      if (options.length >= 2) optionsStore.push(contextKeyOf(useUi.getState()), options)
      return
    }
    case 'reply.show':
      return agent.showReply()
    case 'reply.hide':
      return agent.showGreeting()
    case 'theme.set':
      if (THEMES.has(args.mode as ThemeMode)) ui.setTheme(args.mode as ThemeMode)
      return
    case 'voice.listen':
      // Browsers need a user gesture to start the mic; surface the chip instead.
      optionsStore.push(contextKeyOf(useUi.getState()), [actOption('Tap to talk', { type: 'voice' })])
      return
    case 'colors.set': {
      // Hex colours are checked by the scheme engine; hours must be a number, capped at 168.
      const { hours, ...input } = args as SchemeInput & { hours?: unknown }
      setColors(input, typeof hours === 'number' && Number.isFinite(hours) ? Math.min(hours, 168) : undefined)
      return
    }
    case 'vault.open':
      return ui.openVault()
    case 'vault.close':
      return ui.closeVault()
    case 'vault.search': {
      const query = typeof args.query === 'string' ? args.query.trim().slice(0, 60) : ''
      const category = CATEGORIES.some((c) => c.id === args.category) ? (args.category as string) : null
      if (!useUi.getState().vault) ui.openVault()
      vault.search(query)
      vault.showCategory(category)
      return
    }
    case 'finds.set':
      setFinds(Array.isArray(args.items) ? args.items : [])
      return
    case 'colors.reset':
      resetColors()
      return
    case 'push.offer': {
      const status = usePush.getState().status
      if (status === 'off')
        optionsStore.push(contextKeyOf(useUi.getState()), [
          actOption('Let Wendy remind me', { type: 'enablePush' }),
          actOption('Not now', { type: 'snoozePush' }),
        ])
      else if (status === 'needs-install')
        optionsStore.push(contextKeyOf(useUi.getState()), [actOption('Get reminders here', { type: 'installHelp' })])
      return
    }
  }
}

/** A delivered reminder arrived while the app is open: Wendy says it in her line. */
function announce(n: Notification): void {
  const now = Date.now()
  const due = n.sent_at || !n.scheduled_for || Date.parse(n.scheduled_for) <= now
  const fresh = now - Date.parse(n.sent_at ?? n.created_at) < 10 * 60_000
  if (!due || !fresh || n.read_at) return
  // Not looking at the app? Make it a real OS notification (the server sent no push).
  void notifyInBackground(n)
  if (useUi.getState().chatOpen) return
  agent.showNotice({ notificationId: n.id, title: n.title, body: n.body })
  agent.react('positive', 0.45, 1400)
}

/**
 * A thread was deleted (here or on another device). If it was the one we're in,
 * forget it so the next message starts fresh instead of failing on a dead id.
 */
function threadGone(id: string | null): void {
  if (!id) return
  forgetFindsThread(id)
  if (recallMain() === id) rememberMain(null)
  if (useAgent.getState().conversationId === id) {
    useAgent.setState({ conversationId: null, messages: [], history: { hasMore: false, cursor: null } })
  }
}

/** Every thread was deleted (deleteAll, account wipe, or an admin purge). */
function threadsPurged(): void {
  forgetFindsThread()
  rememberMain(null)
  useAgent.setState({ conversationId: null, messages: [], history: { hasMore: false, cursor: null } })
}

/** A data change we couldn't prove is ours (admin fan-out): reload our own copy, debounced. */
const refetchTimers = new Map<string, ReturnType<typeof setTimeout>>()
function refetchOwn(bus: FrameBus, event: string): void {
  clearTimeout(refetchTimers.get(event))
  refetchTimers.set(
    event,
    setTimeout(() => {
      if (event === 'task') void request(bus, { type: 'task.list' }, 'task.list')
      else if (event === 'goal') void request(bus, { type: 'goal.list' }, 'goal.list')
      else if (event === 'notification')
        void request(bus, { type: 'notification.list', deliveredOnly: false }, 'notification.list')
      else if (event === 'calendar') void refreshCalendar(bus)
      else if (event === 'vault' && useVault.getState().status === 'ready')
        void import('./client').then((m) => m.loadVault())
    }, 400),
  )
}

function routeEvent(bus: FrameBus, event: string, data: Record<string, unknown> & { type?: string }): void {
  const sub = data.type
  switch (event) {
    case 'task':
      if (sub === 'task:deleted') entities.removeTask(String(data.id))
      else if (data.task) entities.upsertTask(data.task as Task)
      return
    case 'goal':
      if (sub === 'goal:deleted') entities.removeGoal(String(data.id))
      else if (data.goal) entities.upsertGoal(data.goal as Goal)
      return
    case 'pending_action':
      // Something Wendy prepared that waits for the user's OK (an email, an invite…).
      pending.apply(data)
      return
    case 'vault':
      // Her remember/forget tools broadcast too; ignore ids we don't hold (forget_fact).
      if (sub === 'vault:deleted') vault.remove(String(data.id))
      else if (data.entry && typeof data.entry === 'object') vault.upsert(data.entry as VaultEntry)
      return
    case 'notification':
      if (sub === 'notification:deleted') entities.removeNotification(String(data.id))
      else if (data.notification) {
        entities.upsertNotification(data.notification as Notification)
        if (sub === 'notification:created') announce(data.notification as Notification)
      }
      return
    case 'calendar':
      if (sub === 'calendar:deleted') entities.removeEvent(String(data.id))
      else applyCalendarEvent(bus, data.event as CalendarOccurrence | undefined)
      return
    case 'mood':
      useAgent.setState({ mood: data as unknown as MoodState })
      return
    case 'emotion':
      useAgent.setState({ emotion: pickEmotion(data) })
      return
    case 'agent_command':
      runCommand(data.command as AgentCommand | undefined)
      return
    case 'conversation': {
      const s = useAgent.getState()
      if (sub === 'conversation:appended' && data.conversationId === s.conversationId && !s.turnId) {
        void request(
          bus,
          { type: 'conversation.open', conversationId: s.conversationId, limit: 40 },
          'conversation.messages',
        )
      } else if (sub === 'conversation:deleted') {
        threadGone(typeof data.conversationId === 'string' ? data.conversationId : null)
      } else if (sub === 'conversation:purged') {
        threadsPurged()
      }
      return
    }
  }
}

export function routeFrame(f: ServerFrame, bus: FrameBus): void {
  // Only this user's events, before anything else sees them (owner.ts: admin
  // sockets also get every other user's events from the server).
  if (isEventFrame(f)) {
    const a = useAgent.getState()
    const verdict = eventVerdict(f.event, f as { userId?: unknown }, f.data, a.userId, a.isAdmin)
    if (verdict === 'drop') return
    if (verdict === 'refetch') return refetchOwn(bus, f.event)
  }
  // Wendy sometimes calls a ui_action by name as if it were its own tool
  // (colors_set{…}); the server refuses it as unknown, so run it here instead.
  // Only for a turn of ours: the user's own, or the finds hunt.
  const turn = typeof f.conversationId === 'string' ? f.conversationId : null
  if (
    f.type === 'tool.progress' &&
    f.phase === 'called' &&
    turn &&
    (turn === useAgent.getState().turnId || isFindsThread(turn))
  ) {
    const action = strayAction(f.name)
    const args = action ? actionArgs(f.argsSummary) : null
    if (action && args) runUiAction(action, args)
  }
  // The fun-finds thread runs its own turns; claim its frames before the user's chat sees them.
  if (handleFindsFrame(f)) return
  if (handleChatFrame(f)) return

  switch (f.type) {
    case 'hello': {
      const userId = typeof f.userId === 'string' ? f.userId : null
      // Per-user caches (fun finds, welcome line) must not leak across accounts on a shared device.
      adoptFindsUser(userId)
      adoptGreetingUser(userId)
      adoptMainUser(userId)
      vault.reset()
      pending.clear()
      useAgent.setState({
        userId,
        botName: typeof f.botName === 'string' ? f.botName : 'Wendy',
        email: typeof f.email === 'string' ? f.email : null,
        isAdmin: f.isAdmin === true,
        ...(f.mood && typeof f.mood === 'object' ? { mood: f.mood as MoodState } : {}),
      })
      bootstrap(bus)
      return
    }

    case 'conversation.active': {
      // The server's "active" is just its most recent thread; after a finds hunt
      // that's the Fun finds thread. Never adopt it: use the user's own thread.
      let id = typeof f.conversationId === 'string' ? f.conversationId : null
      if (id && isFindsThread(id)) id = null
      id ??= recallMain()
      useAgent.setState({ conversationId: id })
      if (id) {
        rememberMain(id)
        void request(bus, { type: 'conversation.open', conversationId: id, limit: 40 }, 'conversation.messages')
      }
      return
    }
    case 'conversation.messages':
      if (f.conversationId === useAgent.getState().conversationId) {
        loadTranscript((f.messages as TranscriptMessage[]) ?? [], {
          hasMore: f.hasMore === true,
          nextBeforeSeq: typeof f.nextBeforeSeq === 'number' ? f.nextBeforeSeq : null,
        })
      }
      return
    case 'conversation.deleted':
      threadGone(typeof f.conversationId === 'string' ? f.conversationId : null)
      return
    case 'conversation.purged':
      threadsPurged()
      return
    case 'account.wiped':
      window.location.reload()
      return

    case 'mood':
      if (f.mood) useAgent.setState({ mood: f.mood as MoodState })
      return

    case 'task.list':
      entities.setTasks((f.tasks as Task[]) ?? [])
      return
    case 'task.created':
    case 'task.completed':
    case 'task.updated':
      if (f.task) entities.upsertTask(f.task as Task)
      return
    case 'task.deleted':
      entities.removeTask(String(f.id))
      return

    case 'goal.list':
      entities.setGoals((f.goals as Goal[]) ?? [])
      return
    case 'goal.created':
    case 'goal.updated':
      if (f.goal) entities.upsertGoal(f.goal as Goal)
      return
    case 'goal.deleted':
      entities.removeGoal(String(f.id))
      return

    case 'notification.list':
      entities.setNotifications((f.notifications as Notification[]) ?? [])
      return
    case 'notification.created':
    case 'notification.marked':
      if (f.notification) entities.upsertNotification(f.notification as Notification)
      return

    case 'calendar.list':
      entities.setEvents((f.events as CalendarOccurrence[]) ?? [])
      return
    case 'calendar.created':
    case 'calendar.updated':
      applyCalendarEvent(bus, f.event as CalendarOccurrence | undefined)
      return
    case 'calendar.deleted':
      entities.removeEvent(String(f.id))
      return
  }

  if (isEventFrame(f)) routeEvent(bus, f.event, f.data)
}
