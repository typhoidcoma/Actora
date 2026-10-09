import { create } from 'zustand'

export const TILE_IDS = ['tasks', 'goals', 'calendar', 'inbox'] as const
export type TileId = (typeof TILE_IDS)[number]

interface UiState {
  focus: TileId | null
  chatOpen: boolean
}

export const useUi = create<UiState>(() => ({ focus: null, chatOpen: false }))

export const ui = {
  focus: (id: TileId | null) => useUi.setState({ focus: id, chatOpen: false }),
  openChat: () => useUi.setState({ chatOpen: true, focus: null }),
  closeChat: () => useUi.setState({ chatOpen: false }),
  closeAll: () => useUi.setState({ focus: null, chatOpen: false }),
}

/** Aelora canvas app ids ↔ our tiles (WEBSOCKET.md → "Canvas commands"). Legacy `tasks` folds into `goals`. */
export const APP_TO_TILE: Record<string, TileId | 'chat'> = {
  goals: 'goals',
  tasks: 'tasks',
  calendar: 'calendar',
  wendy: 'chat',
}

export function openAppsFor(state: UiState): string[] {
  if (state.chatOpen) return ['wendy']
  if (state.focus === 'calendar') return ['calendar']
  if (state.focus === 'goals' || state.focus === 'tasks') return ['goals']
  return []
}
