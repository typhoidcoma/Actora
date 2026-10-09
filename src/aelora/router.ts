import { actOption, sayOption } from '../options/types'
import { resubscribe } from '../push/push'
import { agent, useAgent, type Reaction } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { optionsStore } from '../stores/options'
import { usePush } from '../stores/push'
import {
  APP_TO_TILE,
  contextKeyOf,
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
import type { FrameBus } from './socket'

/**
 * ui_action names we accept; advertised in client_state so Wendy can drive the
 * whole screen (WEBSOCKET.md → client-advertised catalogs).
 *   tile.focus {tile} · tile.close · chat.open · chat.close
 *   item.focus {kind: task|goal|event|notification, id}   open its tile and select it
 *   options.set {options: [{label, say}]}                  replace the tap options here
 *   reply.show · reply.hide                                her line: reply vs greeting
 *   theme.set {mode: auto|day|dusk} · voice.listen · push.offer
 */
export const AVAILABLE_ACTIONS = [
  'tile.focus',
  'tile.close',
  'chat.open',
  'chat.close',
  'item.focus',
  'options.set',
  'reply.show',
  'reply.hide',
  'theme.set',
  'voice.listen',
  'push.offer',
] as const

/** Reaction states the orb can play (AVATAR-INTEGRATION.md DEFAULT_STATES). */
export const ANIMATIONS = [
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
  const visible =
    u.focus === 'tasks'
      ? Object.values(e.tasks)
          .filter((t) => t.status !== 'done')
          .map((t) => t.title)
      : u.focus === 'goals'
        ? Object.values(e.goals).map((g) => g.title)
        : u.focus === 'calendar'
          ? Object.values(e.events).map((x) => x.title)
          : u.focus === 'inbox'
            ? Object.values(e.notifications).map((n) => n.title)
            : []
  return { context: contextKeyOf(u), focus: u.focus, selected: u.selected, visible: visible.slice(0, 12) }
}

export function sendClientState(bus: FrameBus): void {
  bus.send({
    type: 'client_state',
    openApps: openAppsFor(useUi.getState()),
    focus: contextKeyOf(useUi.getState()),
    ui: { availableActions: [...AVAILABLE_ACTIONS], animations: [...ANIMATIONS], screen: screen() },
    timestamp: new Date().toISOString(),
  })
}

export function refreshCalendar(bus: FrameBus) {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from.getTime() + 14 * 86_400_000)
  return request(bus, { type: 'calendar.list', from: from.toISOString(), to: to.toISOString() }, 'calendar.list')
}

/** Post-hello sequence (FRONTEND.md → "Reconnect checklist"). Different reply types may run concurrently. */
function bootstrap(bus: FrameBus): void {
  bus.send({ type: 'tz.set', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  sendClientState(bus)
  void request(bus, { type: 'notification.list' }, 'notification.list')
  void request(bus, { type: 'task.list' }, 'task.list')
  void request(bus, { type: 'goal.list' }, 'goal.list')
  void refreshCalendar(bus)
  void resubscribe()
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
      else if (target) ui.focus(target)
      return
    }
    case 'close_app': {
      const target = APP_TO_TILE[cmd.id]
      const s = useUi.getState()
      if (target === 'chat' && s.chatOpen) ui.closeChat()
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

export function runUiAction(action: string, args: Record<string, unknown>): void {
  switch (action) {
    case 'tile.focus':
      if (typeof args.tile === 'string') ui.focus(args.tile as TileId)
      return
    case 'tile.close':
      return ui.focus(null)
    case 'chat.open':
      return ui.openChat()
    case 'chat.close':
      return ui.closeChat()
    case 'item.focus':
      if (ITEM_KINDS.has(args.kind as ItemKind) && typeof args.id === 'string') {
        ui.select({ kind: args.kind as ItemKind, id: args.id })
      }
      return
    case 'options.set': {
      const list = Array.isArray(args.options) ? args.options : []
      const options = list
        .map((o) => (o && typeof o === 'object' ? (o as { label?: unknown; say?: unknown }) : null))
        .filter((o): o is { label: unknown; say?: unknown } => !!o && typeof o.label === 'string' && !!o.label.trim())
        .slice(0, 5)
        .map((o) =>
          sayOption(String(o.label).slice(0, 28), typeof o.say === 'string' ? o.say : String(o.label), 'pushed'),
        )
      optionsStore.push(contextKeyOf(useUi.getState()), options)
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
  if (!due || !fresh || n.read_at || useUi.getState().chatOpen) return
  agent.showNotice({ notificationId: n.id, title: n.title, body: n.body })
  agent.react('positive', 0.45, 1400)
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
      } else if (sub === 'conversation:purged') {
        useAgent.setState({ messages: [] })
      }
      return
    }
  }
}

export function routeFrame(f: ServerFrame, bus: FrameBus): void {
  if (handleChatFrame(f)) return

  switch (f.type) {
    case 'hello':
      useAgent.setState({
        botName: typeof f.botName === 'string' ? f.botName : 'Wendy',
        email: typeof f.email === 'string' ? f.email : null,
        ...(f.mood && typeof f.mood === 'object' ? { mood: f.mood as MoodState } : {}),
      })
      bootstrap(bus)
      return

    case 'conversation.active': {
      const id = typeof f.conversationId === 'string' ? f.conversationId : null
      useAgent.setState({ conversationId: id })
      if (id) void request(bus, { type: 'conversation.open', conversationId: id, limit: 40 }, 'conversation.messages')
      return
    }
    case 'conversation.messages':
      if (f.conversationId === useAgent.getState().conversationId && !f.requestBeforeSeq) {
        loadTranscript((f.messages as TranscriptMessage[]) ?? [])
      }
      return
    case 'conversation.purged':
      useAgent.setState({ messages: [] })
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
