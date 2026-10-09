import type { Selected, TileId } from '../stores/ui'

/** Something a chip does directly, without a chat turn. */
export type LocalAct =
  | { type: 'focus'; tile: TileId }
  | { type: 'close' }
  | { type: 'openChat' }
  | { type: 'select'; item: Selected }
  | { type: 'complete'; id: string }
  | { type: 'reschedule'; id: string; due: string }
  | { type: 'markRead'; id: string }
  | { type: 'markAllRead' }
  | { type: 'voice' }
  | { type: 'keyboard' }
  | { type: 'enablePush' }
  | { type: 'snoozePush' }
  | { type: 'installHelp' }
  | { type: 'greeting' }
  | { type: 'huntFinds' }
  | { type: 'openFinds' }
  | { type: 'saveFind'; id: string }
  | { type: 'askDelete'; item: Selected }

/**
 * One tap target. `say` sends a chat turn to Wendy in the user's voice;
 * `act` runs locally. Exactly one of the two is set.
 */
export interface Option {
  id: string
  label: string
  say?: string
  act?: LocalAct
  source: 'local' | 'wendy' | 'pushed'
  /** Pinned ahead of Wendy-written options (e.g. one per priority card). */
  pin?: boolean
  /** A stand-in: only fills space Wendy's options leave (even if it's a direct action). */
  alt?: boolean
}

export const sayOption = (label: string, say = label, source: Option['source'] = 'local'): Option => ({
  id: `${source}:say:${label.toLowerCase()}`,
  label,
  say,
  source,
})

export const actOption = (label: string, act: LocalAct): Option => ({
  id: `local:act:${act.type}:${label.toLowerCase()}`,
  label,
  act,
  source: 'local',
})
