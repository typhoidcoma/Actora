import type { FrameBus } from '../aelora/socket'
import { agentName } from './agent'
import { request } from '../aelora/request'
import { entities, useEntities } from './entities'
import { toast } from './toast'
import type { Task } from '../aelora/protocol'

// Quick capture: a thought typed while the agent is busy or the app is offline is
// never lost. Online it becomes a task at once; offline it waits here (and in
// localStorage, in case the tab closes) and is added on that user's next
// connect. Each thought is kept with whose it is, so on a shared device it
// never lands in someone else's account.

const KEY = 'actora.captures.v2'

interface Capture {
  owner: string
  title: string
  at: number
}

function read(): Capture[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v)
      ? v.filter(
          (x): x is Capture =>
            !!x &&
            typeof x === 'object' &&
            typeof (x as Capture).owner === 'string' &&
            typeof (x as Capture).title === 'string',
        )
      : []
  } catch {
    return []
  }
}
function write(list: Capture[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: kept in memory for this session only */
  }
}

let memory: Capture[] = read()

const create = (bus: FrameBus, title: string) =>
  request<{ type: string; task?: Task }>(bus, { type: 'task.create', title }, 'task.created', {
    match: (f) => f.task?.title === title,
  })

/** Save a thought as a task: now if we can, otherwise on this user's next connect. */
export async function capture(
  bus: FrameBus | null,
  online: boolean,
  owner: string | null,
  title: string,
): Promise<void> {
  const text = title.trim().slice(0, 200)
  if (!text) return
  if (bus && online) {
    const reply = await create(bus, text)
    if (reply?.task) {
      entities.upsertTask(reply.task)
      return void toast.show(`Added "${text}" to your tasks`)
    }
  }
  if (!owner) return void toast.error("Couldn't save that. Try again once you're signed in.")
  memory = [...memory, { owner, title: text, at: Date.now() }]
  write(memory)
  toast.show(`Saved "${text}". It'll be added when ${agentName()}'s back.`)
}

/**
 * On connect: add this user's offline thoughts (others' wait for them). A
 * thought already on the list (the create went through but its reply was lost)
 * isn't added twice.
 */
export async function flushCaptures(bus: FrameBus, owner: string | null): Promise<void> {
  if (!owner) return
  const mine = memory.filter((c) => c.owner === owner)
  if (!mine.length) return
  memory = memory.filter((c) => c.owner !== owner)
  write(memory)
  const have = () => new Set(Object.values(useEntities.getState().tasks).map((t) => t.title.trim().toLowerCase()))
  let added = 0
  for (const c of mine) {
    if (have().has(c.title.toLowerCase())) continue
    const reply = await create(bus, c.title)
    if (reply?.task) {
      entities.upsertTask(reply.task)
      added++
    } else memory.push(c)
  }
  write(memory)
  if (added) toast.show(`Added ${added} saved thought${added === 1 ? '' : 's'} to your tasks`)
}
