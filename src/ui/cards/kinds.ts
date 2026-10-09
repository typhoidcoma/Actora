import type { ItemKind } from '../../stores/ui'

/** Per-kind label and colour, shared by cards, panels and badges. */
export const KIND: Record<ItemKind, { label: string; color: string; list: string }> = {
  task: { label: 'Task', color: '#EB7B59', list: 'tasks' },
  event: { label: 'Event', color: '#6E9C92', list: 'calendar' },
  notification: { label: 'Reminder', color: '#8A7690', list: 'inbox' },
  goal: { label: 'Goal', color: '#A7C5BD', list: 'goals' },
}

/** Urgency heat: red when it can't wait, daylily in the middle, smoke when calm. */
export function urgencyColor(u: number): string {
  if (u >= 0.8) return '#CF4647'
  if (u >= 0.5) return '#EB7B59'
  return '#A7C5BD'
}

/** Inner-corner notch class per slot (toward the orb at the grid centre). */
export const NOTCH = ['notch-br', 'notch-bl', 'notch-tr', 'notch-tl'] as const
export const GLOW_AT = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'] as const
