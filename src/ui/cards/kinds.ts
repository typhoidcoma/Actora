import type { ItemKind } from '../../stores/ui'
import { ROLE } from '../brand'

/** Per-kind label and colour, shared by cards, panels and badges. */
export const KIND: Record<ItemKind, { label: string; color: string; list: string }> = {
  task: { label: 'Task', color: ROLE.kind.task, list: 'tasks' },
  event: { label: 'Event', color: ROLE.kind.event, list: 'calendar' },
  notification: { label: 'Reminder', color: ROLE.kind.notification, list: 'inbox' },
  goal: { label: 'Goal', color: ROLE.kind.goal, list: 'goals' },
}

/** Urgency heat: pink when it can't wait, blue in the middle, green when calm. */
export function urgencyColor(u: number): string {
  if (u >= 0.8) return ROLE.heat.urgent
  if (u >= 0.5) return ROLE.heat.mid
  return ROLE.heat.calm
}

/** Inner-corner notch class per slot (toward the orb at the grid centre). */
export const NOTCH = ['notch-br', 'notch-bl', 'notch-tr', 'notch-tl'] as const
export const GLOW_AT = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'] as const
