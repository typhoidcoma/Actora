import type { FrameBus } from '../aelora/socket'
import { request } from '../aelora/request'
import { entities } from './entities'
import { toast } from './toast'
import type { Task } from '../aelora/protocol'

// Quick capture: a thought typed while Wendy is busy or the app is offline is
// never lost. Online it becomes a task at once; offline it waits here (and in
// localStorage, in case the tab closes) and is added on the next connect.

const KEY = 'actora.captures.v1'

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function write(list: string[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: kept in memory for this session only */
  }
}

let memory: string[] = read()

export const queuedCaptures = () => memory.length

/** Save a thought as a task: now if we can, otherwise on the next connect. */
export async function capture(bus: FrameBus | null, online: boolean, title: string): Promise<void> {
  const text = title.trim().slice(0, 200)
  if (!text) return
  if (bus && online) {
    const reply = await request<{ type: string; task?: Task }>(
      bus,
      { type: 'task.create', title: text },
      'task.created',
    )
    if (reply?.task) {
      entities.upsertTask(reply.task)
      return void toast.show(`Added "${text}" to your tasks`)
    }
  }
  memory = [...memory, text]
  write(memory)
  toast.show(`Saved "${text}". It'll be added when Wendy's back.`)
}

/** On connect: add everything captured while offline. */
export async function flushCaptures(bus: FrameBus): Promise<void> {
  const list = memory
  if (!list.length) return
  memory = []
  write([])
  let added = 0
  for (const title of list) {
    const reply = await request<{ type: string; task?: Task }>(bus, { type: 'task.create', title }, 'task.created')
    if (reply?.task) {
      entities.upsertTask(reply.task)
      added++
    } else memory.push(title)
  }
  write(memory)
  if (added) toast.show(`Added ${added} saved thought${added === 1 ? '' : 's'} to your tasks`)
}
