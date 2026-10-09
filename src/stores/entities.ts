import { create } from 'zustand'
import { occurrenceKey, type CalendarOccurrence, type Goal, type Notification, type Task } from '../aelora/protocol'

type ById<T> = Record<string, T>

export interface EntitiesState {
  tasks: ById<Task>
  goals: ById<Goal>
  events: ById<CalendarOccurrence>
  notifications: ById<Notification>
  hydrated: { tasks: boolean; goals: boolean; events: boolean; notifications: boolean }
}

const initial = (): EntitiesState => ({
  tasks: {},
  goals: {},
  events: {},
  notifications: {},
  hydrated: { tasks: false, goals: false, events: false, notifications: false },
})

export const useEntities = create<EntitiesState>(initial)

const set = useEntities.setState
const get = useEntities.getState

function index<T>(list: T[], key: (t: T) => string): ById<T> {
  const out: ById<T> = {}
  for (const item of list) out[key(item)] = item
  return out
}

/** Keep the newer row when the same entity arrives twice (direct reply + broadcast echo). */
function newer<T extends { updated_at?: string }>(prev: T | undefined, next: T): boolean {
  if (!prev?.updated_at || !next.updated_at) return true
  return next.updated_at >= prev.updated_at
}

function upsertInto<K extends 'tasks' | 'goals'>(kind: K, item: EntitiesState[K][string]): void {
  const map = get()[kind] as ById<Task | Goal>
  if (!newer(map[item.id], item)) return
  set({ [kind]: { ...map, [item.id]: item } } as Partial<EntitiesState>)
}

function removeFrom(kind: 'tasks' | 'goals' | 'notifications', id: string): void {
  const map = get()[kind]
  if (!(id in map)) return
  const next = { ...map }
  delete next[id]
  set({ [kind]: next } as Partial<EntitiesState>)
}

export const entities = {
  reset: () => set(initial()),

  setTasks: (list: Task[]) =>
    set((s) => ({ tasks: index(list, (t) => t.id), hydrated: { ...s.hydrated, tasks: true } })),
  upsertTask: (t: Task) => upsertInto('tasks', t),
  removeTask: (id: string) => removeFrom('tasks', id),

  setGoals: (list: Goal[]) =>
    set((s) => ({ goals: index(list, (g) => g.id), hydrated: { ...s.hydrated, goals: true } })),
  upsertGoal: (g: Goal) => upsertInto('goals', g),
  removeGoal: (id: string) => removeFrom('goals', id),

  setNotifications: (list: Notification[]) =>
    set((s) => ({
      notifications: index(list, (n) => n.id),
      hydrated: { ...s.hydrated, notifications: true },
    })),
  upsertNotification: (n: Notification) => set((s) => ({ notifications: { ...s.notifications, [n.id]: n } })),
  removeNotification: (id: string) => removeFrom('notifications', id),

  setEvents: (list: CalendarOccurrence[]) =>
    set((s) => ({ events: index(list, occurrenceKey), hydrated: { ...s.hydrated, events: true } })),
  /** Replace every occurrence of one event id (a series collapses to its id). */
  upsertEvent: (e: CalendarOccurrence) =>
    set((s) => {
      const next: ById<CalendarOccurrence> = {}
      for (const [k, v] of Object.entries(s.events)) if (v.id !== e.id) next[k] = v
      next[occurrenceKey(e)] = e
      return { events: next }
    }),
  removeEvent: (id: string) =>
    set((s) => {
      const next: ById<CalendarOccurrence> = {}
      for (const [k, v] of Object.entries(s.events)) if (v.id !== id) next[k] = v
      return { events: next }
    }),
}
