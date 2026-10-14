import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  blockUser,
  deleteDm,
  discardDm,
  editDm,
  loadOlder,
  markRead,
  muteThread,
  openThread,
  retryDm,
  sendDm,
} from '../../social/social'
import type { DmMessage, Pending } from '../../social/types'
import { messagesFor, ownerName, pendingFor, speakerOf, threadName, useSocial, type Speaker } from '../../stores/social'
import { ROLE } from '../brand'
import { ui } from '../../stores/ui'
import { clockTime, dayLabel } from '../format'
import { morph, press } from '../motion'
import { Confirm } from './bits'

/** What's being edited in a thread (the composer shows it). */
const editingListeners = new Set<(m: DmMessage | null) => void>()
let editingNow: DmMessage | null = null
function setEditing(m: DmMessage | null) {
  editingNow = m
  for (const fn of editingListeners) fn(m)
}
function useEditing(): DmMessage | null {
  const [m, set] = useState(editingNow)
  useEffect(() => {
    editingListeners.add(set)
    return () => void editingListeners.delete(set)
  }, [])
  return m
}

const FAILED: Record<string, string> = {
  rate_limited: 'Too many at once',
  not_found: "Can't send here any more",
  bad_request: "Couldn't send that",
  timeout: 'Not sent',
}

/** One conversation: bubbles in seq order, yours on the right; the composer is ThreadComposer. */
export function ThreadBody({ id }: { id: string }) {
  const thread = useSocial((s) => s.threads[id])
  const byThread = useSocial((s) => s.messages[id])
  const pendingAll = useSocial((s) => s.pending)
  const loading = useSocial((s) => !!s.loading[id])
  const me = useSocial((s) => s.profile?.userId ?? null)
  const messages = useMemo(() => messagesFor({ [id]: byThread ?? {} }, id), [byThread, id])
  const pending = useMemo(() => pendingFor(pendingAll, id), [pendingAll, id])
  const [picked, setPicked] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // The latest page on open (it also brings edits made while you were away).
  useEffect(() => {
    openThread(id)
    return () => setEditing(null)
  }, [id])

  // Read while it's on screen and the window has focus, and again as messages arrive.
  const newest = messages.at(-1)?.seq ?? 0
  useEffect(() => {
    const read = () => document.visibilityState === 'visible' && document.hasFocus() && markRead(id)
    read()
    window.addEventListener('focus', read)
    document.addEventListener('visibilitychange', read)
    return () => {
      window.removeEventListener('focus', read)
      document.removeEventListener('visibilitychange', read)
    }
  }, [id, newest])

  // Stay at the bottom unless the user has scrolled up to read back.
  useEffect(() => {
    const box = end.current?.closest('.scroll-y')
    if (!box) return
    const onScroll = () => (stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80)
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [])
  useLayoutEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pending.length, newest])

  if (!thread) return <p className="text-[15px] text-muted">This conversation isn't available.</p>
  const other = thread.members[0]
  const oldest = messages[0]?.seq ?? 0

  return (
    <div className="flex min-h-full flex-col">
      {thread.kind === 'assistant' && thread.role !== 'owner' && (
        <p className="mb-3 text-[13px] leading-snug text-muted">
          You're talking to {ownerName(thread)}'s assistant, an AI. It can check when they're free, share what they've
          chosen to, and take a message. It can't book or promise anything.
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        <motion.button
          whileTap={press}
          onClick={() => muteThread(id, !thread.muted)}
          aria-pressed={thread.muted}
          className="glass-pill h-9 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
        >
          {thread.muted ? 'Unmute' : 'Mute'}
        </motion.button>
        {other && (
          <Confirm
            label="Block"
            ask={`Block ${other.handle ? '@' + other.handle : 'them'}?`}
            onConfirm={() => {
              blockUser(other.userId)
              ui.openDm(null)
            }}
          />
        )}
      </div>

      {oldest > 1 && (
        <button
          onClick={() => loadOlder(id)}
          disabled={loading}
          className="glass-pill mx-auto mb-3 h-10 rounded-[8px] px-4 text-[14px] font-medium text-muted disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load earlier'}
        </button>
      )}
      {!messages.length && !pending.length && (
        <p className="my-auto text-center text-[15px] text-muted">
          {loading ? 'Loading…' : 'No messages yet. Say hello.'}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        {messages.map((m, i) => (
          <Bubble
            key={m.seq}
            m={m}
            who={speakerOf(m, thread, me)}
            day={i === 0 || dayLabel(messages[i - 1]!.createdAt) !== dayLabel(m.createdAt)}
            picked={picked === m.id}
            onPick={() => setPicked(picked === m.id ? null : m.id)}
          />
        ))}
        {pending.map((p) => (
          <PendingBubble key={p.clientMsgId} p={p} />
        ))}
      </div>
      <div ref={end} className="h-1 shrink-0" />
    </div>
  )
}

function Bubble({
  m,
  who,
  day,
  picked,
  onPick,
}: {
  m: DmMessage
  who: Speaker
  day: boolean
  picked: boolean
  onPick: () => void
}) {
  const gone = !!m.deletedAt
  const mine = who.side === 'me'
  const canEdit = who.editable && !gone
  return (
    <>
      {day && <p className="my-2 text-center text-[12px] text-faint">{dayLabel(m.createdAt)}</p>}
      <div className={`flex max-w-[80%] flex-col ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
        {who.label && (
          <span
            className={`mb-0.5 px-1 text-[12px] font-semibold ${who.agent ? '' : 'text-muted'}`}
            style={who.agent ? { color: 'var(--ink-agent)' } : undefined}
          >
            {who.label}
          </span>
        )}
        <button
          onClick={canEdit ? onPick : undefined}
          disabled={!canEdit}
          className={`selectable rounded-[6px] px-4 py-2.5 text-left text-[16px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere] ${
            who.agent
              ? `${mine ? 'rounded-br-[3px]' : 'rounded-bl-[3px]'} text-strong`
              : mine
                ? 'rounded-br-[3px] bg-accent/25 text-strong'
                : 'glass-pill rounded-bl-[3px] text-strong'
          } ${gone ? 'italic text-muted' : ''} disabled:cursor-text`}
          // An agent's words read differently from a person's: her colour, a hairline edge.
          style={
            who.agent
              ? {
                  background: `color-mix(in srgb, ${ROLE.agent} 30%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--ink-agent) 45%, transparent)`,
                }
              : undefined
          }
        >
          {gone ? 'Message deleted' : m.body}
        </button>
        <span className="mt-0.5 px-1 text-[11px] text-faint">
          {clockTime(m.createdAt)}
          {m.editedAt && !gone ? ' · edited' : ''}
        </span>
        <AnimatePresence initial={false}>
          {picked && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={morph}
              className="flex gap-2 overflow-hidden pt-1"
            >
              <button
                onClick={() => {
                  setEditing(m)
                  onPick()
                }}
                className="glass-pill h-9 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
              >
                Edit
              </button>
              <Confirm label="Delete" ask="Delete it?" onConfirm={() => void deleteDm(m.id)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

function PendingBubble({ p }: { p: Pending }) {
  const failed = p.state === 'failed'
  return (
    <div className="flex max-w-[80%] flex-col items-end self-end">
      <p
        className={`rounded-[6px] rounded-br-[3px] bg-accent/15 px-4 py-2.5 text-[16px] leading-snug whitespace-pre-wrap text-strong [overflow-wrap:anywhere] ${failed ? '' : 'opacity-70'}`}
      >
        {p.body}
      </p>
      {failed ? (
        <span className="mt-1 flex items-center gap-2 text-[12px]">
          <span className="text-urgent">{FAILED[p.error ?? ''] ?? 'Not sent'}</span>
          <button onClick={() => retryDm(p.clientMsgId)} className="font-semibold text-strong">
            Retry
          </button>
          <button onClick={() => discardDm(p.clientMsgId)} className="text-muted">
            Discard
          </button>
        </span>
      ) : (
        <span className="mt-0.5 px-1 text-[11px] text-faint">Sending…</span>
      )}
    </div>
  )
}

/** The message box under a conversation (an edit takes it over until it's saved). */
export function ThreadComposer({ id }: { id: string }) {
  const editing = useEditing()
  const who = useSocial((s) => (s.threads[id] ? threadName(s.threads[id]) : 'them'))
  // Your own receptionist's thread: writing here takes over from her for a while.
  const takeover = useSocial((s) => s.threads[id]?.kind === 'assistant' && s.threads[id]?.role === 'owner')
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      setText(editing.body)
      input.current?.focus()
    }
  }, [editing])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim()) return
    if (editing) {
      if (text.trim() !== editing.body) editDm(editing.id, text)
      setEditing(null)
      setText('')
    } else if (sendDm(id, text)) setText('')
  }

  return (
    <div>
      {takeover && (
        <p className="mb-2 px-1 text-[12px] text-muted">
          Writing here takes over: your assistant steps back for 10 minutes.
        </p>
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setText('')
            }}
            aria-label="Stop editing"
            className="glass-pill h-12 shrink-0 rounded-full px-3 text-[13px] font-semibold text-muted"
          >
            Cancel
          </button>
        )}
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder={editing ? 'Edit your message' : 'Message'}
          aria-label={editing ? 'Edit your message' : `Message ${who}`}
          // Typing anywhere in this conversation lands here, not in Wendy's box (typeAnywhere).
          data-type-here
          enterKeyHint="send"
          className="glass-pill h-12 min-w-0 flex-1 rounded-full px-5 text-[16px] text-strong placeholder:text-faint focus:outline-none"
        />
        <motion.button
          whileTap={press}
          type="submit"
          // Keep focus in the box, so the phone keyboard stays up for the next message.
          onPointerDown={(e) => e.preventDefault()}
          disabled={!text.trim()}
          aria-label={editing ? 'Save edit' : 'Send'}
          className="grid h-12 min-w-12 shrink-0 place-items-center rounded-full bg-fill px-3.5 text-[14px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
        >
          {editing ? (
            'Save'
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path
                d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
                stroke="currentColor"
                strokeWidth={1.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </motion.button>
      </form>
    </div>
  )
}
