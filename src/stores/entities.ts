import { create } from 'zustand'
import { occurrenceKey, type CalendarOccurrence, type Goal, type Notification, type Task } from '../aelora/protocol'

type ById<T> = Record<string, T>

export interface EntitiesState {
  tasks: ById<Task>
  goals: ById<Goal>
  events: ById<CalendarOccurrence>
  notifications: ById<Notification>
  hydrated: { tasks: boolean; goals: boolean; events: boolean; notifications: boolean }
  /** Lists that couldn't be loaded: counted as loaded, but the screens say so instead of "All clear". */
  failed: { tasks: boolean; goals: boolean; events: boolean; notifications: boolean }
}

const initial = (): EntitiesState => ({
  tasks: {},
  goals: {},
  events: {},
  notifications: {},
  hydrated: { tasks: false, goals: false, events: false, notifications: false },
  failed: { tasks: false, goals: false, events: false, notifications: false },
})

type Kind = keyof EntitiesState['hydrated']
/** A list arrived: it's loaded, and whatever failed before is fine now. */
const loaded = (s: EntitiesState, kind: Kind) => ({
  hydrated: { ...s.hydrated, [kind]: true },
  failed: { ...s.failed, [kind]: false },
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
  /** A list that couldn't be loaded: count it as loaded so nothing waits on it forever, and say it failed. */
  markFailed: (kind: Kind) =>
    set((s) => ({ hydrated: { ...s.hydrated, [kind]: true }, failed: { ...s.failed, [kind]: true } })),

  setTasks: (list: Task[]) => set((s) => ({ tasks: index(list, (t) => t.id), ...loaded(s, 'tasks') })),
  upsertTask: (t: Task) => upsertInto('tasks', t),
  removeTask: (id: string) => removeFrom('tasks', id),

  setGoals: (list: Goal[]) => set((s) => ({ goals: index(list, (g) => g.id), ...loaded(s, 'goals') })),
  upsertGoal: (g: Goal) => upsertInto('goals', g),
  removeGoal: (id: string) => removeFrom('goals', id),

  setNotifications: (list: Notification[]) =>
    set((s) => ({
      notifications: index(list, (n) => n.id),
      ...loaded(s, 'notifications'),
    })),
  upsertNotification: (n: Notification) => set((s) => ({ notifications: { ...s.notifications, [n.id]: n } })),
  removeNotification: (id: string) => removeFrom('notifications', id),

  setEvents: (list: CalendarOccurrence[]) =>
    set((s) => ({ events: index(list, occurrenceKey), ...loaded(s, 'events') })),
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
