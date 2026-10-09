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
  focus: TileId | null
  chatOpen: boolean
  /** Row expanded inside the focused tile; drives item options. */
  selected: Selected | null
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
  theme: 'auto',
  keyboardOpen: false,
}))

export const ui = {
  focus: (id: TileId | null) => useUi.setState({ focus: id, chatOpen: false, selected: null }),
  openChat: () => useUi.setState({ chatOpen: true, focus: null, selected: null }),
  closeChat: () => useUi.setState({ chatOpen: false }),
  closeAll: () => useUi.setState({ focus: null, chatOpen: false, selected: null, keyboardOpen: false }),
  /** Toggle a row; selecting opens its tile first so Wendy can point at anything. */
  select: (item: Selected | null) => {
    const s = useUi.getState()
    if (!item) return useUi.setState({ selected: null })
    if (s.selected?.kind === item.kind && s.selected.id === item.id) return useUi.setState({ selected: null })
    useUi.setState({ focus: ITEM_TILE[item.kind], chatOpen: false, selected: item })
  },
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

export function contextKeyOf(state: Pick<UiState, 'focus' | 'chatOpen' | 'selected'>): ContextKey {
  if (state.chatOpen) return 'chat'
  if (state.selected) return `item:${state.selected.kind}:${state.selected.id}`
  if (state.focus) return `tile:${state.focus}`
  return 'home'
}
