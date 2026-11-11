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
import { toast } from '../stores/toast'
import { refreshGoogle } from '../google/google'
import { flushCaptures } from '../stores/captures'
import { sessions } from '../stores/session'
import { actOption, sayOption } from '../options/types'
import { notifyInBackground, resubscribe } from '../push/push'
import { agent, agentName, rememberAgentName, useAgent, type Reaction } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { scoreItems } from '../priority/score'
import { optionsStore, useOptionsStore } from '../stores/options'
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
  type PeopleView,
  type ThemeMode,
  type TileId,
} from '../stores/ui'
import { setCheckins, useCheckins } from '../checkins/checkins'
import { greetingInContext, recentAcks, handleChatFrame, loadTranscript, reactToMessage } from './chat'
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
import { request, resetLateReplies } from './request'
import { describeScheme, type SchemeInput } from '../color/scheme'
import { resetColors, setColors, useScheme } from '../stores/scheme'
import type { FrameBus } from './socket'
import { actionArgs, AVAILABLE_ACTIONS, strayAction } from './actions'
import { eventVerdict } from './owner'
import { peekThenChat, talkKey } from '../ui/peek'
import { play } from '../sound/sound'
import { phone } from '../stores/phone'
import { handleSocialFrame, socialConnected } from '../social/social'
import { setActionRunner } from './chat'
import { social, spoken, threadName, useSocial, waitingSummary } from '../stores/social'

/**
 * ui_action names we accept; advertised in client_state so the agent can drive the
 * whole screen (WEBSOCKET.md → client-advertised catalogs). Playbook: docs/agent-ui.md.
 *   priorities.set {items: [{kind, id, why?}]}             rank the three cards (30 min)
 *   home.show                                              close everything: back to the cards
 *   card.open / item.focus {kind, id} · card.close         one item in its own panel
 *   list.open / tile.focus {tile, kind?, id?} · tile.close full Tasks/Calendar/Goals/Inbox list
 *                                                          (with kind+id: that row highlighted)
 *   (reader.open · reader.close: old aliases of chat.open / chat.close, obeyed but not advertised)
 *   finds.open · finds.close · finds.refresh               box 4: the fun finds / hunt for more
 *   finds.focus {id}                                       open the finds with one picked
 *   finds.set {items: [{title, blurb, why, url, image, source, tag}]}   the fun finds cards
 *   vault.open · vault.close                               the Vault: what she knows about the user
 *   vault.search {query?, category?}                       open the Vault filtered
 *   people.open · people.close                             People (friends and messages), opened for the
 *                                                          user to read; nothing in it is ever sent to her
 *   options.set {options: [{label, say}]}                  replace the tap options here
 *   chat.open · chat.close · reply.show · reply.hide
 *   message.react {emoji}                                  one emoji on the user's message: her "got it"
 *   checkins.set {on}                                      her now-and-then check-ins on or off
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

/** The open conversation in People: its id and who it's with (no message text). */
function openThread(id: string): { id: string; with: string } {
  const t = useSocial.getState().threads[id]
  return { id, with: t ? spoken(threadName(t)) : 'someone' }
}

/** What the user is looking at, so a persona that reads the ui blob can refer to it. */
function screen() {
  const u = useUi.getState()
  const greeting = greetingInContext()
  const acks = recentAcks()
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
  const v = useVault.getState()
  return {
    context: contextKeyOf(u),
    focus: u.focus,
    selected: u.selected,
    // Her welcome line, sent outside this thread: when the user answers, this is what they're answering.
    ...(greeting ? { yourGreeting: greeting } : {}),
    // The emoji she opened her last replies with (shown on the user's messages): vary them.
    ...(acks.length ? { yourRecentEmoji: acks.join(' ') } : {}),
    chat: u.chatOpen,
    // A wide screen: what she opens sits beside the chat instead of over it.
    split: phone.split(),
    vault: u.vault ? { open: true, query: v.query, category: v.category } : { open: false },
    // People: which part is up, and what's waiting there: unread counts with who they're
    // from (muted conversations left out) and who's asked to be friends. Never what anyone wrote.
    people: {
      open: u.people,
      ...(u.people ? { view: u.dmThread ? 'conversation' : u.peopleView } : {}),
      // The conversation on screen, so "what's this about?" or "reply to this" has a thread_id
      // for read_messages / draft_message. Who it's with, never what's in it.
      ...(u.people && u.dmThread ? { thread: openThread(u.dmThread) } : {}),
      ...waitingSummary(useSocial.getState()),
    },
    // The user's Look setting, and what's actually showing now (auto follows the sun).
    theme: u.theme,
    themeNow: typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dusk' ? 'dusk' : 'day',
    reminders: usePush.getState().status,
    // Her now-and-then check-ins (the user can turn them off; so can she, when asked).
    checkins: useCheckins.getState().on ? 'on' : 'off',
    ...homeScreen(),
    colors: describeScheme(useScheme.getState().scheme, useScheme.getState().source),
    visible: visible.slice(0, 12),
  }
}

/**
 * The parts of the screen that change without the user moving: the three cards,
 * box 4, approvals waiting, and the pills. The client resends client_state when
 * these change (client.ts), so she never talks about cards that have gone.
 */
export function homeScreen() {
  const u = useUi.getState()
  const e = useEntities.getState()
  const p = usePriorityStore.getState()
  const priorities = mergePriorities(
    scoreItems(e, Date.now()),
    p.agent,
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
  return {
    // Prepared actions the user hasn't answered yet (they approve with a tap, in a later turn).
    pending: waiting(usePending.getState().items).map((p) => ({ id: p.id, kind: p.kind })),
    priorities,
    box4,
    // The pills under the cards (or in the chat), in order: what a tap would say or do.
    pills: useOptionsStore.getState().visible[contextKeyOf(u)] ?? [],
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

/**
 * A startup list, retried twice if it fails (a lost reply, a hiccup). If it still
 * fails it counts as loaded, so the greeting and finds don't wait on it forever,
 * but it's marked failed: the screens say it couldn't load, never "All clear".
 */
async function loadList(
  fetch: () => Promise<unknown>,
  kind: ListKind,
): Promise<void> {
  for (const wait of [0, 2000, 6000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    if (await fetch()) return
  }
  entities.markFailed(kind)
}

type ListKind = 'tasks' | 'goals' | 'events' | 'notifications'
const LIST_FETCH: Record<ListKind, (bus: FrameBus) => Promise<unknown>> = {
  notifications: (bus) => request(bus, { type: 'notification.list', deliveredOnly: false }, 'notification.list'),
  tasks: (bus) => request(bus, { type: 'task.list' }, 'task.list'),
  goals: (bus) => request(bus, { type: 'goal.list' }, 'goal.list'),
  events: (bus) => refreshCalendar(bus),
}

/** "Try again" on a list that couldn't load. */
export function reloadList(bus: FrameBus, kind: ListKind): Promise<void> {
  return loadList(() => LIST_FETCH[kind](bus), kind)
}

/** Post-hello sequence (FRONTEND.md → "Reconnect checklist"). Different reply types may run concurrently. */
function bootstrap(bus: FrameBus): void {
  bus.send({ type: 'tz.set', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  sendClientState(bus)
  void reloadList(bus, 'notifications')
  // Offline thoughts go on once the list is in (so one already there isn't added twice).
  void reloadList(bus, 'tasks').then(() => flushCaptures(bus, useAgent.getState().userId))
  void reloadList(bus, 'goals')
  void reloadList(bus, 'events')
  void resubscribe()
  void refreshGoogle()
  void request(bus, { type: 'session.list' }, 'session.list')
  socialConnected(bus)
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

/**
 * Her UI moves that would put something over the chat. While you're talking
 * with her, each is a glance (peekThenChat): it shows for a few seconds, then
 * the chat comes back. Going home or closing a list would only end the
 * conversation, so those wait until the chat's closed.
 */
const SCREEN_MOVES = new Set([
  'home.show',
  'list.open',
  'tile.focus',
  'tile.close',
  'card.open',
  'item.focus',
  'finds.open',
  'finds.focus',
  'vault.open',
  'vault.search',
  'people.open',
])
const CLOSES_EVERYTHING = new Set(['home.show', 'tile.close'])

/** Running the move a glance shows (so it isn't turned into a glance again). */
let glancing = false

/** Her screen move mid-conversation: skipped, run as a glance, or (false) run as is. */
function asGlance(action: string, run: () => void): boolean {
  if (glancing || !useUi.getState().chatOpen) return false
  // A wide screen has room for both: what she opens sits beside the chat, and
  // going home closes just that window.
  if (phone.split()) {
    if (action !== 'home.show') return false
    ui.closePanels()
    return true
  }
  if (CLOSES_EVERYTHING.has(action)) return true
  peekThenChat(() => {
    glancing = true
    try {
      run()
    } finally {
      glancing = false
    }
  })
  return true
}


/**
 * Her "open the chat". While you're busy in People it only happens if you're
 * talking with her right now (you sent something and she's answering): a
 * background turn (a check-in) never pulls you out of a conversation with a friend.
 */
function herOpenChat(): void {
  const a = useAgent.getState()
  const talking = a.awaitingTurn || a.turnId !== null
  if (useUi.getState().people && !talking) return
  ui.openChat()
}
function runCommand(cmd: AgentCommand | undefined): void {
  if (!cmd || typeof cmd !== 'object') return
  switch (cmd.type) {
    case 'open_app': {
      const target = APP_TO_TILE[cmd.id]
      if (!target) return refused('open_app', 'unknown app', { id: cmd.id })
      if (target === 'chat') herOpenChat()
      else if (asGlance('open_app', () => runCommand(cmd))) return
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
const PEOPLE_VIEWS = new Set<PeopleView>(['home', 'profile', 'add', 'blocked'])
const THEME_WORDS: Record<string, ThemeMode> = {
  dark: 'dusk',
  night: 'dusk',
  evening: 'dusk',
  light: 'day',
  daylight: 'day',
  system: 'auto',
}
const TILES = new Set<TileId>(TILE_IDS)
/** Her words for the lists, not always ours: "Calendar", "events", "schedule", "todos". */
const TILE_WORDS: Record<string, TileId> = {
  task: 'tasks',
  todo: 'tasks',
  todos: 'tasks',
  goal: 'goals',
  event: 'calendar',
  events: 'calendar',
  schedule: 'calendar',
  agenda: 'calendar',
  notification: 'inbox',
  notifications: 'inbox',
  reminders: 'inbox',
}
const tileOf = (v: unknown): TileId | null => {
  const w = typeof v === 'string' ? v.trim().toLowerCase() : ''
  const t = TILE_WORDS[w] ?? w
  return TILES.has(t as TileId) ? (t as TileId) : null
}
/** The kind of an item, read loosely too: "Task", "events", a calendar item. */
const kindOf = (v: unknown): ItemKind | null => {
  const w = typeof v === 'string' ? v.trim().toLowerCase().replace(/s$/, '') : ''
  const k = w === 'calendar' ? 'event' : w
  return ITEM_KINDS.has(k as ItemKind) ? (k as ItemKind) : null
}

/**
 * What she did on screen, in the browser console, so "she said she opened it but
 * nothing happened" can be told apart from "she never asked": each action as it
 * arrives, and why one was turned down.
 */
const heard = (action: string, args: Record<string, unknown>) => console.info('[her action]', action, args)
const refused = (action: string, why: string, args: Record<string, unknown>) =>
  console.warn('[her action] refused', action, `(${why})`, args)

function itemExists(kind: ItemKind, id: string): boolean {
  const e = useEntities.getState()
  if (kind === 'task') return !!e.tasks[id]
  if (kind === 'goal') return !!e.goals[id]
  if (kind === 'notification') return !!e.notifications[id]
  return Object.values(e.events).some((x) => x.id === id)
}

// Screen actions she writes into a reply instead of calling run through here too (chat.ts).
setActionRunner((action, args) => runUiAction(action, args))

export function runUiAction(action: string, args: Record<string, unknown>): void {
  if (!glancing) heard(action, args)
  if (SCREEN_MOVES.has(action) && asGlance(action, () => runUiAction(action, args))) return
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
      const kind = kindOf(args.kind)
      if (kind && typeof args.id === 'string' && itemExists(kind, args.id)) {
        return ui.reveal({ kind, id: args.id })
      }
      // The list by its name (whichever key she put it under), else the list her item belongs in.
      const tile = tileOf(args.tile) ?? tileOf(args.list) ?? tileOf(args.name) ?? tileOf(args.kind)
      if (tile) return ui.focus(tile)
      return refused(action, 'no such list', args)
    }
    case 'tile.close':
      return ui.focus(null)
    case 'card.close':
      if (useUi.getState().selected) ui.select(null)
      return
    // The reader is the chat now (one place for her words); kept as aliases.
    case 'reader.open':
      return herOpenChat()
    case 'finds.open':
      return ui.openFinds()
    case 'finds.close':
      return ui.closeFinds()
    case 'finds.focus':
      if (typeof args.id === 'string' && useFinds.getState().items.some((x) => x.id === args.id)) {
        ui.openFinds()
        ui.selectFind(args.id)
        return
      }
      return refused(action, 'no find with that id', args)
    case 'finds.refresh':
      return hunt()
    case 'reader.close':
      return ui.closeChat()
    case 'chat.open':
      return herOpenChat()
    case 'chat.close':
      return ui.closeChat()
    case 'card.open':
    case 'item.focus': {
      const kind = kindOf(args.kind)
      if (kind && typeof args.id === 'string' && itemExists(kind, args.id)) return ui.open({ kind, id: args.id })
      return refused(action, kind ? 'no item with that id' : 'unknown kind', args)
    }
    case 'options.set': {
      const list = Array.isArray(args.options) ? args.options : []
      const options = list
        .map((o) => (o && typeof o === 'object' ? (o as { label?: unknown; say?: unknown }) : null))
        .filter((o): o is { label: unknown; say?: unknown } => !!o && typeof o.label === 'string' && !!o.label.trim())
        .slice(0, 5)
        .map((o) => ({
          ...sayOption(
            String(o.label),
            (typeof o.say === 'string' && o.say.trim() ? o.say.trim() : String(o.label)).slice(0, 160),
            'pushed',
          ),
          answer: true,
        }))
      // 2–5 answers; a lone option isn't a choice, so keep the current ones instead.
      if (options.length >= 2) optionsStore.push(talkKey(), options)
      return
    }
    case 'reply.show':
      return agent.showReply()
    case 'reply.hide':
      return agent.showGreeting()
    // (reply.react: its old name.)
    case 'checkins.set':
      if (typeof args.on === 'boolean') setCheckins(args.on)
      return
    case 'message.react':
    case 'reply.react':
      return void reactToMessage(args.emoji)
    case 'theme.set': {
      // She doesn't always use our words: dark/night are dusk, light is day.
      const said = String(args.mode ?? args.theme ?? '')
        .trim()
        .toLowerCase()
      const mode = THEME_WORDS[said] ?? said
      if (THEMES.has(mode as ThemeMode)) return ui.setTheme(mode as ThemeMode)
      return refused(action, 'unknown mode', args)
    }
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
    // She can bring People up for the user ("show me my messages") but never sees what's in it.
    case 'people.open': {
      // Optionally straight to a part of it: your profile (name, handle, assistant), adding a friend, blocked.
      const view = PEOPLE_VIEWS.has(args.view as PeopleView) ? (args.view as PeopleView) : 'home'
      return ui.openPeople(null, view)
    }
    case 'people.close':
      return ui.closePeople()
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
          actOption(`Let ${agentName()} remind me`, { type: 'enablePush' }),
          actOption('Not now', { type: 'snoozePush' }),
        ])
      else if (status === 'needs-install')
        optionsStore.push(contextKeyOf(useUi.getState()), [actOption('Get reminders here', { type: 'installHelp' })])
      return
    }
    default:
      refused(action, 'not an action Actora has', args)
  }
}

/** A delivered reminder arrived while the app is open: The agent says it in her line. */
function announce(n: Notification): void {
  const now = Date.now()
  const due = n.sent_at || !n.scheduled_for || Date.parse(n.scheduled_for) <= now
  const fresh = now - Date.parse(n.sent_at ?? n.created_at) < 10 * 60_000
  if (!due || !fresh || n.read_at) return
  // Not looking at the app? Make it a real OS notification (the server sent no push).
  void notifyInBackground(n)
  // Looking at it: a gentle tone (silent in the background, where the OS notification speaks).
  play('reminder')
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
    case 'session':
      sessions.apply(data.session)
      return
    case 'pending_action':
      // Something the agent prepared that waits for the user's OK (an email, an invite…).
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
      // Another device added to this thread: reload it, unless a turn of ours is under way
      // (reloading then would drop the message just sent until the reply lands).
      if (sub === 'conversation:appended' && data.conversationId === s.conversationId && !s.turnId && !s.awaitingTurn) {
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
  // The agent sometimes calls a ui_action by name as if it were its own tool
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
  if (handleSocialFrame(f, bus)) return

  switch (f.type) {
    case 'hello': {
      const userId = typeof f.userId === 'string' ? f.userId : null
      // Per-user caches (fun finds, welcome line) must not leak across accounts on a shared device.
      adoptFindsUser(userId)
      adoptGreetingUser(userId)
      adoptMainUser(userId)
      resetLateReplies()
      // Someone else now (or the first hello): drop the last person's state. The same
      // user reconnecting keeps what's waiting for their OK, their focus session, the Vault.
      const prev = useAgent.getState().userId
      if (prev !== userId) {
        if (prev !== null) agent.resetForUser()
        vault.reset()
        pending.clear()
        sessions.clear()
        social.reset()
        optionsStore.resetHistory()
        toast.dismiss()
      } else if (useUi.getState().vault) {
        void import('./client').then((m) => m.loadVault())
      }
      if (typeof f.botName === 'string' && f.botName.trim()) rememberAgentName(f.botName.trim())
      useAgent.setState({
        userId,
        botName: typeof f.botName === 'string' && f.botName.trim() ? f.botName.trim() : useAgent.getState().botName,
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
      // The thread the user picked here (Past chats, New chat) wins over the server's latest.
      let id = recallMain() ?? (typeof f.conversationId === 'string' ? f.conversationId : null)
      if (id && isFindsThread(id)) id = null
      const was = useAgent.getState().conversationId
      // A different (or no) thread: its messages, not the previous one's.
      useAgent.setState(
        id === was
          ? { conversationId: id }
          : { conversationId: id, messages: [], history: { hasMore: false, cursor: null } },
      )
      if (id) {
        rememberMain(id)
        void request(bus, { type: 'conversation.open', conversationId: id, limit: 40 }, 'conversation.messages').then(
          // Couldn't read it: her welcome goes ahead without it.
          (r) => r || useAgent.setState({ transcriptReady: true }),
        )
      } else useAgent.setState({ transcriptReady: true })
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

    case 'session.list':
      sessions.setList(f.sessions)
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
