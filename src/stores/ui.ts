import { create } from 'zustand'

export const TILE_IDS = ['tasks', 'goals', 'calendar', 'inbox'] as const
export type TileId = (typeof TILE_IDS)[number]

export type ItemKind = 'task' | 'goal' | 'event' | 'notification'
export interface Selected {
  kind: ItemKind
  id: string
}

export type ThemeMode = 'auto' | 'day' | 'dusk'

export interface UiState {
  /** Full list panel for a domain (Tasks, Calendar, Goals, Inbox). */
  focus: TileId | null
  chatOpen: boolean
  /**
   * The item being looked at; drives item options. With `focus` set it is a
   * highlighted row in that list; without, it is open in its own item panel.
   */
  selected: Selected | null
  /** Wendy's full answer (box 4) expanded to fill the grid. */
  reader: boolean
  theme: ThemeMode
  /** Hidden text fallback (behind the mic chip). */
  keyboardOpen: boolean
}

export const ITEM_TILE: Record<ItemKind, TileId> = {
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
  theme: 'auto',
  keyboardOpen: false,
}))

const same = (a: Selected | null, b: Selected) => a?.kind === b.kind && a.id === b.id

export const ui = {
  focus: (id: TileId | null) => useUi.setState({ focus: id, chatOpen: false, selected: null, reader: false }),
  openChat: () => useUi.setState({ chatOpen: true, focus: null, selected: null, reader: false }),
  closeChat: () => useUi.setState({ chatOpen: false }),
  closeAll: () => useUi.setState({ focus: null, chatOpen: false, selected: null, reader: false, keyboardOpen: false }),
  /** Open an item in its own panel (from a card, or when Wendy points at it). */
  open: (item: Selected) => useUi.setState({ selected: item, focus: null, chatOpen: false, reader: false }),
  /** Show an item in its full list, highlighted ("See all"). */
  reveal: (item: Selected) =>
    useUi.setState({ focus: ITEM_TILE[item.kind], selected: item, chatOpen: false, reader: false }),
  /** Toggle a highlighted row inside the open list. */
  select: (item: Selected | null) => {
    const s = useUi.getState()
    if (!item) return useUi.setState({ selected: null })
    if (same(s.selected, item)) return useUi.setState({ selected: null })
    useUi.setState({ selected: item, focus: s.focus ?? ITEM_TILE[item.kind], chatOpen: false, reader: false })
  },
  openReader: () => useUi.setState({ reader: true, focus: null, selected: null, chatOpen: false }),
  closeReader: () => useUi.setState({ reader: false }),
  setTheme: (theme: ThemeMode) => useUi.setState({ theme }),
  keyboard: (open: boolean) => useUi.setState({ keyboardOpen: open }),
}

/** Aelora canvas app ids ↔ our tiles (WEBSOCKET.md → "Canvas commands"). Legacy `tasks` folds into `goals`. */
export const APP_TO_TILE: Record<string, TileId | 'chat'> = {
  goals: 'goals',
  tasks: 'tasks',
  calendar: 'calendar',
  wendy: 'chat',
}

export function openAppsFor(state: Pick<UiState, 'focus' | 'chatOpen'>): string[] {
  if (state.chatOpen) return ['wendy']
  if (state.focus === 'calendar') return ['calendar']
  if (state.focus === 'goals' || state.focus === 'tasks') return ['goals']
  return []
}

/** Where the user is, as an options context key: home, tile:<id>, item:<kind>:<id>, chat. */
export type ContextKey = string

export function contextKeyOf(state: Pick<UiState, 'focus' | 'chatOpen' | 'selected' | 'reader'>): ContextKey {
  // Reading Wendy's full answer is part of the conversation: same follow-ups as chat.
  if (state.chatOpen || state.reader) return 'chat'
  if (state.selected) return `item:${state.selected.kind}:${state.selected.id}`
  if (state.focus) return `tile:${state.focus}`
  return 'home'
}
