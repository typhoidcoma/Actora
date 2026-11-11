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
import type { DmMessage, Pending, Thread } from '../../social/types'
import {
  hiddenFrom,
  messagesFor,
  nameOf,
  ownerName,
  pendingFor,
  personIn,
  speakerOf,
  threadName,
  useSocial,
  type Known,
  type Speaker,
} from '../../stores/social'
import { ROLE } from '../brand'
import { useMetrics } from '../../stores/metrics'
import { ui } from '../../stores/ui'
import { clockTime, dayLabel } from '../format'
import { morph, press } from '../motion'
import { AssistantAvatar, Avatar, Confirm } from './bits'

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
  const loadFailed = useSocial((s) => !!s.errors[`history:${id}`])
  const me = useSocial((s) => s.profile?.userId ?? null)
  const names = useSocial((s) => s.names)
  const blocks = useSocial((s) => s.blocks)
  // Whose picture a receptionist wears: the owner chose it (their profile, on your friends list).
  const friends = useSocial((s) => s.friends)
  const ownAssistant = useSocial((s) => s.profile?.assistantAvatarPath ?? null)
  const assistantPicture = (ownerId: string | null | undefined) =>
    ownerId && ownerId === me
      ? ownAssistant
      : (friends.find((f) => f.profile.userId === ownerId)?.profile.assistantAvatarPath ?? null)
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
  // Typing on a phone (keyboard up): the intro and Mute/Block step aside, and the newest
  // messages stay in view as the room shrinks.
  const typing = useMetrics((s) => s.keyboard)
  useLayoutEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pending.length, newest, typing])

  if (!thread) return <p className="text-[15px] text-muted">This conversation isn't available.</p>
  // Blocking is for one person: in a group it would pick whoever happens to be listed first.
  const other = thread.kind === 'group' ? undefined : thread.members[0]
  const oldest = messages[0]?.seq ?? 0

  return (
    <div className="flex min-h-full flex-col">
      {thread.kind === 'assistant' && thread.role !== 'owner' && (
        <p className={`mb-3 text-[13px] leading-snug text-muted ${typing ? 'hidden' : ''}`}>
          You're talking to {ownerName(thread)}'s assistant, an AI. It can check when they're free, share what they've
          chosen to, and take a message. It can't book or promise anything.
        </p>
      )}
      <div className={`mb-3 flex flex-wrap gap-2 ${typing ? 'hidden' : ''}`}>
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
        <div className="my-auto flex flex-col items-center gap-3">
          <p className="text-center text-[15px] text-muted">
            {loading ? 'Loading…' : loadFailed ? "Couldn't load these messages." : 'No messages yet. Say hello.'}
          </p>
          {loadFailed && !loading && (
            <button
              onClick={() => openThread(id)}
              className="glass-pill min-h-11 rounded-[8px] px-5 text-[15px] font-semibold text-strong"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        {messages.map((m, i) => {
          if (hiddenFrom(m, thread, blocks)) return <HiddenRow key={m.seq} />
          const who = speakerOf(m, thread, me, names)
          const prev = messages[i - 1]
          const day = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
          // A face on the first message of each run from the other side.
          const firstOfRun = day || !prev || prev.senderId !== m.senderId || prev.senderKind !== m.senderKind
          const face =
            who.side === 'me' || !firstOfRun ? null : who.agent ? (
              // A group's agents are each their owner's; an assistant thread has the one.
              <AssistantAvatar
                size={28}
                path={assistantPicture(thread.kind === 'group' ? m.senderId : thread.ownerId)}
              />
            ) : (
              <Avatar size={28} who={personIn(thread, m.senderId, names)} />
            )
          return (
            <Bubble
              key={m.seq}
              m={m}
              who={who}
              day={day}
              face={face}
              // A run from one person in a group is named once, like the face.
              named={thread.kind !== 'group' || firstOfRun}
              asked={askedOf(m, thread, me, names)}
              picked={picked === m.id}
              onPick={() => setPicked(picked === m.id ? null : m.id)}
            />
          )
        })}
        {pending.map((p) => (
          <PendingBubble key={p.clientMsgId} p={p} />
        ))}
      </div>
      <div ref={end} className="h-1 shrink-0" />
    </div>
  )
}

/** A blocked person's group message: its place is kept, its words aren't shown. */
function HiddenRow() {
  return <p className="self-start px-1 py-1 text-[13px] text-faint italic">Hidden message (someone you blocked)</p>
}

/** "Asked Sam's assistant" under a group message that woke agents (no wait for a reply: some never come). */
function askedOf(m: DmMessage, t: Thread, me: string | null, names: Record<string, Known>): string | null {
  if (t.kind !== 'group' || !m.agentMentions?.length) return null
  const whose = m.agentMentions.map((id) => (id === me ? 'your' : `${nameOf(personIn(t, id, names))}'s`))
  return `Asked ${whose.join(', ')} assistant${whose.length > 1 ? 's' : ''}`
}

function Bubble({
  m,
  who,
  day,
  face,
  named,
  asked,
  picked,
  onPick,
}: {
  m: DmMessage
  who: Speaker
  day: boolean
  /** Theirs: who wrote it, on the first of a run; null keeps the gap so a run lines up. */
  face: React.ReactNode | null
  /** The first of a run: its label shows (later ones in the run go without). */
  named: boolean
  /** Agents this message asked to answer, said plainly. */
  asked: string | null
  picked: boolean
  onPick: () => void
}) {
  const gone = !!m.deletedAt
  const mine = who.side === 'me'
  const canEdit = who.editable && !gone
  const label = named || who.agent ? who.label : null
  return (
    <>
      {day && <p className="my-2 text-center text-[12px] text-faint">{dayLabel(m.createdAt)}</p>}
      <div className={`flex max-w-[86%] items-start gap-2 ${mine ? 'self-end' : 'self-start'}`}>
        {!mine && <span className={`w-7 shrink-0 ${label ? 'mt-[20px]' : ''}`}>{face}</span>}
        <div className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`}>
          {label && (
            <span
              className={`mb-0.5 px-1 text-[12px] font-semibold ${who.agent ? '' : 'text-muted'}`}
              style={who.agent ? { color: 'var(--ink-agent)' } : undefined}
            >
              {label}
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
            {asked && !gone ? ` · ${asked}` : ''}
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
          <button onClick={() => retryDm(p.clientMsgId)} className="hit px-1 font-semibold text-strong">
            Retry
          </button>
          <button onClick={() => discardDm(p.clientMsgId)} className="hit ml-2 px-1 text-muted">
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
  const thread = useSocial((s) => s.threads[id])
  const me = useSocial((s) => s.profile?.userId ?? null)
  // In a group: the agents here, any of which a message can ask to answer (yours too, if you brought her).
  const agents = useMemo(() => {
    if (thread?.kind !== 'group') return []
    const list = thread.members.filter((m) => m.agentPresent).map((m) => ({ id: m.userId, label: `${nameOf(m)}'s` }))
    return thread.agentPresent && me ? [{ id: me, label: 'Your' }, ...list] : list
  }, [thread, me])
  const [asking, setAsking] = useState<string[]>([])
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (editing) {
      setText(editing.body)
      input.current?.focus()
    } else if (wasEditing.current) {
      // An edit given up (cancelled, or the thread changed): its old words mustn't go out as a new message.
      setText('')
    }
    wasEditing.current = !!editing
  }, [editing])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim()) return
    if (editing) {
      if (text.trim() !== editing.body) editDm(editing.id, text)
      setEditing(null)
      setText('')
    } else if (
      sendDm(
        id,
        text,
        asking.filter((a) => agents.some((x) => x.id === a)),
      )
    ) {
      setText('')
      setAsking([])
    }
  }

  return (
    <div>
      {agents.length > 0 && !editing && (
        // Ask an assistant: up to three a message. A pill, so it never needs typing an @.
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Ask an assistant">
          {agents.map((a) => {
            const on = asking.includes(a.id)
            return (
              <motion.button
                key={a.id}
                whileTap={press}
                type="button"
                aria-pressed={on}
                disabled={!on && asking.length >= 3}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setAsking((l) => (on ? l.filter((x) => x !== a.id) : [...l, a.id]))}
                className={`h-8 max-w-full truncate rounded-full px-3 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                  on ? 'text-strong' : 'glass-pill text-muted'
                }`}
                style={
                  on
                    ? {
                        background: `color-mix(in srgb, ${ROLE.agent} 34%, transparent)`,
                        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink-agent) 45%, transparent)',
                      }
                    : undefined
                }
              >
                Ask {a.label} assistant
              </motion.button>
            )
          })}
        </div>
      )}
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
          name="message"
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
          // Sending has its own sound (sound.ts), not a tap on top of it.
          data-sound="none"
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
