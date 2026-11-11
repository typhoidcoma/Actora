import { CHAT_ERROR_CODES, type ClientMessage, type ServerFrame } from './protocol'
import type { FrameBus } from './socket'

// Aelora correlates replies by `type`, never by id. So:
//  - requests that resolve to the same reply type are queued one at a time;
//  - every request times out (in-flight requests are lost on reconnect);
//  - a reply that turns up after its request timed out is swallowed, so it
//    can't resolve the next request of that type (which would put every later
//    one off by one); a request that knows its item's id also checks it;
//  - an un-attributed `error` frame fails the most recently sent request, but
//    only while that request is fresh (a late error can't fail a later one);
//    an error that names its request type only fails a request of that type.

export interface RequestOptions<T> {
  timeoutMs?: number
  /** Accept only a reply about this item (e.g. `f => f.task?.id === id`). */
  match?: (frame: T) => boolean
}

const queues = new Map<string, Promise<unknown>>()
const inflight: Array<{ drop: () => void; at: number }> = []
/** Per reply type: when requests timed out unanswered (their replies may still come). */
const late = new Map<string, number[]>()
const LATE_TTL_MS = 30_000
const ERROR_WINDOW_MS = 3_000

function expectLate(type: string) {
  late.set(type, [...(late.get(type) ?? []), Date.now()])
}
/** One reply of this type is probably a late one: count it off (forgetting stale guesses). */
function takeLate(type: string): boolean {
  const now = Date.now()
  const live = (late.get(type) ?? []).filter((t) => now - t < LATE_TTL_MS)
  if (!live.length) {
    late.delete(type)
    return false
  }
  live.shift()
  late.set(type, live)
  return true
}

export function request<T extends ServerFrame = ServerFrame>(
  bus: FrameBus,
  msg: ClientMessage,
  replyType: string,
  opts: number | RequestOptions<T> = {},
): Promise<T | null> {
  const o = typeof opts === 'number' ? { timeoutMs: opts } : opts
  const prev = queues.get(replyType) ?? Promise.resolve()
  const run = prev.then(() => once<T>(bus, msg, replyType, o.timeoutMs ?? 12_000, o.match))
  queues.set(
    replyType,
    run.catch(() => null),
  )
  return run
}

function once<T extends ServerFrame>(
  bus: FrameBus,
  msg: ClientMessage,
  replyType: string,
  timeoutMs: number,
  match?: (frame: T) => boolean,
): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false
    const entry = { drop: () => finish(null), at: Date.now() }

    const unsubscribe = bus.subscribe((frame) => {
      if (frame.type === replyType) {
        if (match) {
          if (match(frame as T)) finish(frame as T)
          else takeLate(replyType) // someone else's (late) reply: not ours
        } else if (!takeLate(replyType)) finish(frame as T)
      } else if (
        frame.type === 'error' &&
        !frame.conversationId &&
        !CHAT_ERROR_CODES.has(String(frame.code)) &&
        // Errors that name their request (social ones do) only fail that kind.
        (frame.request === undefined || frame.request === msg.type) &&
        inflight[inflight.length - 1] === entry &&
        Date.now() - entry.at < ERROR_WINDOW_MS
      ) {
        finish(null)
      }
    })
    const timer = setTimeout(() => {
      expectLate(replyType)
      finish(null)
    }, timeoutMs)

    function finish(value: T | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      const i = inflight.indexOf(entry)
      if (i >= 0) inflight.splice(i, 1)
      resolve(value)
    }

    inflight.push(entry)
    if (!bus.send(msg)) finish(null)
  })
}

/** Forget expected late replies (a new connection: the old socket's replies never come). */
export function resetLateReplies(): void {
  late.clear()
}

/**
 * The socket dropped: every request in flight is lost with it. Fail them all now,
 * without expecting their replies later, or each one's timeout would mark a reply
 * as late and swallow the next good reply of its kind on the new connection.
 */
export function failInflight(): void {
  for (const entry of [...inflight]) entry.drop()
  late.clear()
}
