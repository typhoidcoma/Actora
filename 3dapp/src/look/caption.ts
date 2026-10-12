import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ringing } from '@actora/aelora/protocol'
import { useAgent } from '@actora/stores/agent'
import { useEntities } from '@actora/stores/entities'
import { useNow } from '@actora/ui/tiles/data'
import { plainText } from '@actora/ui/markdownText'
import { useLook } from './theme'

/** How long her caption lingers once nothing new is arriving (as the 2D line). */
const FADE_AFTER_MS = 10_000
/** Captions that have already faded this session. */
const fadedAway = new Set<string>()

/** Her first sentence, as the 2D line carries it (the full answer lives in the chat). */
function firstSentence(text: string): string {
  const m = /^[\s\S]*?[.!?…](?=\s|$)/.exec(text)
  return (m ? m[0] : text).trim()
}

/**
 * What she's saying right now, for a caption: her welcome, her reply's first
 * sentence (live while it streams), a reminder, a message, or a lost connection,
 * with its colour. `present` turns false once it has sat still for 10 s (the 2D
 * rule); what needs the user (a reminder, a dead connection, a check-in waiting
 * for its answer) and live words stay. `text` keeps the last words while it fades.
 */
export function useCaption(): { text: string; color: string; present: boolean } {
  const look = useLook()
  const a = useAgent(
    useShallow((s) => ({
      name: s.botName,
      fatal: s.connection === 'fatal',
      line: s.line,
      notice: s.notice,
      message: s.message,
      streaming: s.streaming,
      last: s.messages.findLast((m) => m.role === 'assistant')?.text ?? null,
      greeting: s.greeting.text,
      checkin: !!s.greeting.checkin,
      busy: s.awaitingTurn || s.turnId !== null,
    })),
  )
  const reminder = useEntities((s) => (a.notice ? s.notifications[a.notice.notificationId] : undefined))
  const now = useNow(15_000)
  const ring = a.line === 'notice' && !!reminder && ringing(reminder, now)

  let text: string
  let color = look.strong
  if (a.fatal) {
    text = `Can't reach ${a.name}. Reload to try again.`
    color = look.ink.urgent
  } else if (a.line === 'notice' && a.notice) {
    text = a.notice.body ? `${a.notice.title}: ${a.notice.body}` : a.notice.title
    if (ring) color = look.ink.urgent
  } else if (a.line === 'message' && a.message) text = a.message
  else if (a.line === 'reply') {
    if (a.streaming) text = firstSentence(plainText(a.streaming))
    // Working on it: the animated Activity shows over her head instead.
    else if (a.busy) text = ''
    else text = firstSentence(plainText(a.last ?? ''))
  } else text = a.greeting

  const holds = !!a.streaming || a.fatal || a.line === 'notice' || (a.line === 'greeting' && a.checkin)
  const signature = `${a.line}|${text}`
  const [, setTick] = useState(0)
  useEffect(() => {
    if (holds || !text.trim() || fadedAway.has(signature)) return
    const t = setTimeout(() => {
      fadedAway.add(signature)
      setTick((n) => n + 1)
    }, FADE_AFTER_MS)
    return () => clearTimeout(t)
  }, [signature, holds, text])

  const shown = useRef({ text, color })
  const present = !!text.trim() && (holds || !fadedAway.has(signature))
  if (present) shown.current = { text, color }
  return { ...shown.current, present }
}
