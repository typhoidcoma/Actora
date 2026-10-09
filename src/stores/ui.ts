import { create } from 'zustand'
import { vault } from './vault'

export const TILE_IDS = ['tasks', 'goals', 'calendar', 'inbox'] as const
export type TileId = (typeof TILE_IDS)[number]

export type ItemKind = 'task' | 'goal' | 'event' | 'notification'
export interface Selected {
  kind: ItemKind
  id: string
  /** Which occurrence of a repeating event (its occurrence_start); the series shares one id. */
  occurrence?: string
}

export type ThemeMode = 'auto' | 'day' | 'dusk'

interface UiState {
  /** Full list panel for a domain (Tasks, Calendar, Goals, Inbox). */
  focus: TileId | null
  chatOpen: boolean
  /**
   * The item being looked at; drives item options. With `focus` set it is a
   * highlighted row in that list; without, it is open in its own item panel.
   */
  selected: Selected | null
  /** Wendy's full answer, open in the reader panel. */
  reader: boolean
  /** Box 4's fun finds expanded into their panel. */
  finds: boolean
  /** The find being looked at inside Discover (its options are on the rail). */
  find: string | null
  /** The Vault: what Wendy knows about the user (Aelora's vault). Opened from the menu. */
  vault: boolean
  theme: ThemeMode
  /** The open item panel should start by asking to delete it ("Delete…" from a list row). */
  deleting: boolean
  /** The list an item panel was opened from ("Delete…" on a row), to return to after. */
  back: TileId | null
  /** The task whose day is being picked ("Pick a day…"). */
  picking: string | null
  /** The Past chats sheet (from the menu). */
  pastChats: boolean
  /** Hidden text fallback (behind the mic chip). */
  keyboardOpen: boolean
}

const ITEM_TILE: Record<ItemKind, TileId> = {
  task: 'tasks',
  goal: 'goals',
  event: 'calendar',
  notification: 'inbox',
}

export const useUi = create<UiState>(() => ({
  focus: null,
  chatOpen: false,
  selected: null,
  reader: false,
  finds: false,
  find: null,
  vault: false,
  theme: 'auto',
  deleting: false,
  back: null,
  picking: null,
  pastChats: false,
  keyboardOpen: false,
}))

const same = (a: Selected | null, b: Selected) =>
  a?.kind === b.kind && a.id === b.id && (a.occurrence ?? null) === (b.occurrence ?? null)

/** Every panel closed; spread first, then open the one wanted. */
const CLOSED = {
  focus: null,
  chatOpen: false,
  selected: null,
  reader: false,
  finds: false,
  find: null,
  vault: false,
  deleting: false,
  back: null,
  picking: null,
} as const

/** Is any panel open over the grid (the chat sheet aside)? */
export const panelOpen = (s: Pick<UiState, 'focus' | 'selected' | 'reader' | 'finds' | 'vault'>) =>
  s.focus !== null || s.selected !== null || s.reader || s.finds || s.vault

export const ui = {
  focus: (id: TileId | null) => useUi.setState({ ...CLOSED, focus: id }),
  openChat: () => useUi.setState({ ...CLOSED, chatOpen: true }),
  closeChat: () => useUi.setState({ chatOpen: false }),
  closeAll: () => useUi.setState({ ...CLOSED, keyboardOpen: false }),
  /** Open an item in its own panel (from a card, or when Wendy points at it). */
  open: (item: Selected) => useUi.setState({ ...CLOSED, selected: item }),
  /** Open an item in its panel, already asking whether to delete it. */
  askDelete: (item: Selected) => useUi.setState((s) => ({ ...CLOSED, selected: item, deleting: true, back: s.focus })),
  /** Leave an item panel: back to the list it came from, if any, else home. */
  leaveItem: () => {
    const back = useUi.getState().back
    if (back) ui.focus(back)
    else useUi.setState({ selected: null, back: null })
  },
  /** Show an item in its full list, highlighted ("See all"). */
  reveal: (item: Selected) => useUi.setState({ ...CLOSED, focus: ITEM_TILE[item.kind], selected: item }),
  /** Toggle a highlighted row inside the open list. */
  select: (item: Selected | null) => {
    const s = useUi.getState()
    if (!item) return useUi.setState({ selected: null })
    if (same(s.selected, item)) return useUi.setState({ selected: null })
    useUi.setState({ ...CLOSED, selected: item, focus: s.focus ?? ITEM_TILE[item.kind] })
  },
  openReader: () => useUi.setState({ ...CLOSED, reader: true }),
  closeReader: () => useUi.setState({ reader: false }),
  openFinds: () => useUi.setState({ ...CLOSED, finds: true }),
  closeFinds: () => useUi.setState({ finds: false, find: null }),
  /** Each visit starts unfiltered (Wendy's vault.search filters after opening). */
  openVault: () => {
    if (!useUi.getState().vault) vault.clearFilter()
    useUi.setState({ ...CLOSED, vault: true })
  },
  closeVault: () => useUi.setState({ vault: false }),
  /** Toggle which find is selected in Discover. */
  selectFind: (id: string | null) => useUi.setState((s) => ({ find: id && s.find !== id ? id : null })),
  setTheme: (theme: ThemeMode) => useUi.setState({ theme }),
  keyboard: (open: boolean) => useUi.setState({ keyboardOpen: open }),
  pickDay: (taskId: string | null) => useUi.setState({ picking: taskId }),
  pastChats: (open: boolean) => useUi.setState({ pastChats: open }),
}

/** Aelora canvas app ids ↔ our tiles (WEBSOCKET.md → "Canvas commands"). Legacy `tasks` folds into `goals`. */
export const APP_TO_TILE: Record<string, TileId | 'chat' | 'vault'> = {
  goals: 'goals',
  tasks: 'tasks',
  calendar: 'calendar',
  wendy: 'chat',
  vault: 'vault',
}

export function openAppsFor(state: Pick<UiState, 'focus' | 'chatOpen' | 'vault'>): string[] {
  if (state.chatOpen) return ['wendy']
  if (state.vault) return ['vault']
  if (state.focus === 'calendar') return ['calendar']
  if (state.focus === 'goals' || state.focus === 'tasks') return ['goals']
  return []
}

/** Where the user is, as an options context key: home, tile:<id>, item:<kind>:<id>, chat. */
type ContextKey = string

export function contextKeyOf(
  state: Pick<UiState, 'focus' | 'chatOpen' | 'selected' | 'reader' | 'finds' | 'find' | 'vault'>,
): ContextKey {
  // Reading Wendy's full answer is part of the conversation: same follow-ups as chat.
  if (state.chatOpen || state.reader) return 'chat'
  if (state.vault) return 'vault'
  if (state.finds) return state.find ? `find:${state.find}` : 'finds'
  if (state.selected) return `item:${state.selected.kind}:${state.selected.id}`
  if (state.focus) return `tile:${state.focus}`
  return 'home'
}
