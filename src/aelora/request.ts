import { CHAT_ERROR_CODES, type ClientMessage, type ServerFrame } from './protocol'
import type { FrameBus } from './socket'

// Aelora correlates replies by `type`, never by id. So:
//  - requests that resolve to the same reply type are queued one at a time;
//  - every request times out (in-flight requests are lost on reconnect);
//  - an un-attributed `error` frame fails the most recently sent request.

const queues = new Map<string, Promise<unknown>>()
const inflight: Array<{ fail: () => void }> = []

export function request<T extends ServerFrame = ServerFrame>(
  bus: FrameBus,
  msg: ClientMessage,
  replyType: string,
  timeoutMs = 12_000,
): Promise<T | null> {
  const prev = queues.get(replyType) ?? Promise.resolve()
  const run = prev.then(() => once<T>(bus, msg, replyType, timeoutMs))
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
): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false
    const entry = { fail: () => finish(null) }

    const unsubscribe = bus.subscribe((frame) => {
      if (frame.type === replyType) {
        finish(frame as T)
      } else if (
        frame.type === 'error' &&
        !frame.conversationId &&
        !CHAT_ERROR_CODES.has(String(frame.code)) &&
        inflight[inflight.length - 1] === entry
      ) {
        finish(null)
      }
    })
    const timer = setTimeout(() => finish(null), timeoutMs)

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
