import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  blockUser,
  loadBlocks,
  openAssistant,
  openDmWith,
  removeFriend,
  respondFriend,
  unblockUser,
} from '../../social/social'
import type { FriendRow, Thread } from '../../social/types'
import { incomingRequests, nameOf, threadList, threadName, useSocial } from '../../stores/social'
import { ui, useUi } from '../../stores/ui'
import { ROLE } from '../brand'
import { Panel } from '../cards/Panel'
import { ago } from '../format'
import { morph, press } from '../motion'
import { AddFriend } from './AddFriend'
import { Avatar, Confirm } from './bits'
import { HandlePicker } from './HandlePicker'
import { ProfileView } from './ProfileView'
import { ThreadBody, ThreadComposer } from './PeopleThread'

type View = 'home' | 'add' | 'blocked' | 'profile'

/**
 * People: your friends and your conversations with them. Nothing here reaches
 * Wendy. Everything other people wrote (names, messages) is shown as plain text.
 */
export function PeoplePanel() {
  const { profile, guest, threads } = useSocial()
  const dmThread = useUi((s) => s.dmThread)
  const [view, setView] = useState<View>('home')
  const thread = dmThread ? threads[dmThread] : undefined

  const back = (label: string, to: () => void) => (
    <button onClick={to} className="flex items-center gap-1 text-left" aria-label={`Back to ${label}`}>
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  )

  // Your handle, tappable: your name, handle and who can find you.
  let kicker: React.ReactNode = profile ? (
    <button
      onClick={() => setView('profile')}
      aria-label={`Your profile, @${profile.handle}`}
      className="underline decoration-current/30 underline-offset-4"
    >
      @{profile.handle}
    </button>
  ) : (
    'Friends and messages'
  )
  let title: React.ReactNode = 'People'
  let body: React.ReactNode
  let footer: React.ReactNode

  if (guest) body = <p className="text-[15px] text-muted">Sign in to add friends and send messages.</p>
  else if (profile === undefined) body = <Loading />
  else if (profile === null) {
    title = 'Pick a handle'
    body = <HandlePicker />
  } else if (dmThread) {
    kicker = back('People', () => ui.openDm(null))
    title = thread ? threadName(thread) : 'Conversation'
    body = <ThreadBody key={dmThread} id={dmThread} />
    footer = thread ? <ThreadComposer id={dmThread} /> : undefined
  } else if (view === 'add') {
    kicker = back('People', () => setView('home'))
    title = 'Add a friend'
    body = <AddFriend />
  } else if (view === 'profile') {
    kicker = back('People', () => setView('home'))
    title = 'Your profile'
    body = <ProfileView />
  } else if (view === 'blocked') {
    kicker = back('People', () => setView('home'))
    title = 'Blocked'
    body = <Blocked />
  } else body = <Home onAdd={() => setView('add')} onBlocked={() => setView('blocked')} />

  return (
    <Panel
      layoutId="people"
      accent={ROLE.status.ok}
      kicker={kicker}
      title={title}
      onClose={ui.closePeople}
      footer={footer}
    >
      {body}
    </Panel>
  )
}

function Loading() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="shimmer h-14 rounded-[6px] bg-text/6" />
      ))}
    </div>
  )
}

function Home({ onAdd, onBlocked }: { onAdd: () => void; onBlocked: () => void }) {
  const { friends, threads } = useSocial()
  const requests = useMemo(() => incomingRequests(friends), [friends])
  const list = useMemo(() => threadList(threads), [threads])
  const accepted = friends.filter((f) => f.status === 'accepted')
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing')

  return (
    <div className="grid gap-6">
      <motion.button
        whileTap={press}
        onClick={onAdd}
        className="glass-pill flex h-12 items-center gap-3 rounded-[8px] px-4 text-left text-[15px] font-semibold text-strong"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-accent" aria-hidden>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        Add a friend
      </motion.button>

      {requests.length > 0 && (
        <Section title="Asked to be friends">
          {requests.map((r) => (
            <Row key={r.profile.userId} who={r.profile}>
              <motion.button
                whileTap={press}
                onClick={() => respondFriend(r.profile.userId, true)}
                className="h-9 shrink-0 rounded-[8px] bg-fill px-3 text-[13px] font-semibold text-on-accent"
              >
                Accept
              </motion.button>
              <button
                onClick={() => respondFriend(r.profile.userId, false)}
                className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
              >
                Decline
              </button>
            </Row>
          ))}
        </Section>
      )}

      {list.length > 0 && (
        <Section title="Messages">
          {list.map((t) => (
            <ThreadRow key={t.id} t={t} />
          ))}
        </Section>
      )}

      <Section title="Friends">
        {!accepted.length && !outgoing.length && (
          <p className="py-2 text-[15px] text-muted">No friends yet. Add someone by their handle, or share a link.</p>
        )}
        {accepted.map((f) => (
          <FriendItem key={f.profile.userId} f={f} />
        ))}
        {outgoing.map((f) => (
          <Row key={f.profile.userId} who={f.profile} note="Requested">
            <Confirm
              label="Cancel"
              ask="Cancel request?"
              tone="muted"
              onConfirm={() => void removeFriend(f.profile.userId)}
            />
          </Row>
        ))}
      </Section>

      <button
        onClick={onBlocked}
        className="h-10 justify-self-start text-[14px] font-medium text-muted underline decoration-line underline-offset-4"
      >
        Blocked people
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="label mb-1 text-muted">{title}</h3>
      <ul>
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  )
}

function Row({
  who,
  name,
  note,
  onClick,
  children,
}: {
  who: { displayName: string | null; handle: string | null }
  /** In place of their name (an assistant conversation says whose). */
  name?: React.ReactNode
  note?: React.ReactNode
  onClick?: () => void
  children?: React.ReactNode
}) {
  const main = (
    <>
      <Avatar who={who} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-strong">{name ?? nameOf(who)}</span>
        <span className="block truncate text-[13px] text-muted">
          {note ?? (who.handle && who.displayName?.trim() ? `@${who.handle}` : '')}
        </span>
      </span>
    </>
  )
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
      transition={morph}
      className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
    >
      {onClick ? (
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {main}
        </button>
      ) : (
        main
      )}
      {children}
    </motion.li>
  )
}

function ThreadRow({ t }: { t: Thread }) {
  const last = t.lastMessage
  const line = !last ? 'No messages yet' : last.deletedAt ? 'Message deleted' : last.body
  const who = t.members[0] ?? { displayName: threadName(t), handle: null }
  return (
    <Row
      who={who}
      name={
        t.kind === 'assistant' ? (
          <>
            {threadName(t)} <AiTag />
          </>
        ) : undefined
      }
      onClick={() => ui.openDm(t.id)}
      note={<span className={t.unread && !t.muted ? 'font-semibold text-strong' : ''}>{line}</span>}
    >
      <span className="flex shrink-0 flex-col items-end gap-1">
        {t.lastMessageAt && <span className="text-[12px] text-faint">{ago(t.lastMessageAt)}</span>}
        {t.unread > 0 ? (
          <span
            className={`num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold ${
              t.muted ? 'bg-text/10 text-muted' : 'bg-fill text-on-accent'
            }`}
          >
            {t.unread}
          </span>
        ) : (
          t.muted && <span className="text-[11px] text-faint">Muted</span>
        )}
      </span>
    </Row>
  )
}

function FriendItem({ f }: { f: FriendRow }) {
  const [open, setOpen] = useState(false)
  const id = f.profile.userId
  const assistant = f.profile.assistantAvailable === true
  return (
    <Row
      who={f.profile}
      // Their receptionist takes messages from friends: say so where you'd look for it.
      note={assistant ? `@${f.profile.handle} · has an assistant` : undefined}
      onClick={() => openDmWith(id)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.span
            key="acts"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex gap-2"
          >
            {assistant && (
              <motion.button
                whileTap={press}
                onClick={() => openAssistant(id)}
                className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-strong"
              >
                Assistant
              </motion.button>
            )}
            <Confirm label="Unfriend" ask="Unfriend?" tone="muted" onConfirm={() => void removeFriend(id)} />
            <Confirm label="Block" ask="Block?" onConfirm={() => void blockUser(id)} />
          </motion.span>
        ) : (
          <motion.button
            key="msg"
            whileTap={press}
            onClick={() => openDmWith(id)}
            className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-strong"
          >
            Message
          </motion.button>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fewer options' : `More for ${nameOf(f.profile)}`}
        aria-expanded={open}
        className="grid h-9 w-7 shrink-0 place-items-center text-muted"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
          <circle cx="3" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="13" cy="8" r="1.3" fill="currentColor" />
        </svg>
      </button>
    </Row>
  )
}

function Blocked() {
  const blocks = useSocial((s) => s.blocks)
  useEffect(() => void loadBlocks(), [])
  if (!blocks.length) return <p className="text-[15px] text-muted">You haven't blocked anyone.</p>
  return (
    <ul>
      {blocks.map((b) => (
        <Row key={b.userId} who={{ displayName: null, handle: b.handle }} note={`Blocked ${ago(b.blockedAt)}`}>
          <button
            onClick={() => unblockUser(b.userId)}
            className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
          >
            Unblock
          </button>
        </Row>
      ))}
    </ul>
  )
}

/** Marks an agent (a friend's receptionist), so it's never mistaken for the person. */
function AiTag() {
  return (
    <span
      className="ml-1 rounded-[4px] px-1 py-px align-middle text-[10px] font-bold tracking-wide"
      style={{ color: 'var(--ink-agent)', background: `color-mix(in srgb, ${ROLE.agent} 28%, transparent)` }}
    >
      AI
    </span>
  )
}
