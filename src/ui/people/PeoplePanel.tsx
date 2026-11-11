import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  blockUser,
  loadBlocks,
  openAssistant,
  openDmWith,
  removeFriend,
  respondFriend,
  retryProfile,
  unblockUser,
} from '../../social/social'
import { agentName, useAgent } from '../../stores/agent'
import type { FriendRow, Thread } from '../../social/types'
import { hiddenFrom, incomingRequests, nameOf, personIn, threadList, threadName, useSocial } from '../../stores/social'
import { ui, useUi } from '../../stores/ui'
import { ROLE } from '../brand'
import { Panel } from '../cards/Panel'
import { ago } from '../format'
import { morph, press } from '../motion'
import { AddFriend } from './AddFriend'
import { AssistantAvatar, Avatar, Confirm, StackedAvatars } from './bits'
import { GroupInfo } from './GroupInfo'
import { HandlePicker } from './HandlePicker'
import { NewGroup } from './NewGroup'
import { ProfileView } from './ProfileView'
import { ThreadBody, ThreadComposer } from './PeopleThread'

/**
 * People: your friends and your conversations with them. Nothing here reaches
 * Wendy. Everything other people wrote (names, messages) is shown as plain text.
 */
export function PeoplePanel() {
  const { profile, guest, threads } = useSocial()
  const dmThread = useUi((s) => s.dmThread)
  const view = useUi((s) => s.peopleView)
  const setView = ui.peopleView
  const thread = dmThread ? threads[dmThread] : undefined
  // A group's info (members, name, leave) in place of its messages; a new conversation starts on its messages.
  const [info, setInfo] = useState<string | null>(null)
  const showInfo = !!thread && thread.kind === 'group' && info === thread.id

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
  } else if (dmThread && showInfo) {
    kicker = back(threadName(thread), () => setInfo(null))
    title = 'Group info'
    body = <GroupInfo key={dmThread} thread={thread} />
  } else if (dmThread) {
    kicker =
      thread?.kind === 'group' ? (
        <span className="flex flex-wrap items-center gap-x-4">
          {back('People', () => ui.openDm(null))}
          <button onClick={() => setInfo(thread.id)} className="underline decoration-current/30 underline-offset-4">
            Group info
          </button>
        </span>
      ) : (
        back('People', () => ui.openDm(null))
      )
    title = thread ? threadName(thread) : 'Conversation'
    body = <ThreadBody key={dmThread} id={dmThread} />
    // Keyed by thread: a draft for one person never carries over to another.
    footer = thread ? <ThreadComposer key={dmThread} id={dmThread} /> : undefined
  } else if (view === 'add') {
    kicker = back('People', () => setView('home'))
    title = 'Add a friend'
    body = <AddFriend />
  } else if (view === 'newGroup') {
    kicker = back('People', () => setView('home'))
    title = 'New group'
    body = <NewGroup />
  } else if (view === 'profile') {
    kicker = back('People', () => setView('home'))
    title = 'Your profile'
    body = <ProfileView />
  } else if (view === 'blocked') {
    kicker = back('People', () => setView('home'))
    title = 'Blocked'
    body = <Blocked />
  } else
    body = (
      <Home onAdd={() => setView('add')} onGroup={() => setView('newGroup')} onBlocked={() => setView('blocked')} />
    )

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
  const failed = useSocial((s) => !!s.errors.load)
  const offline = useAgent((s) => s.connection !== 'open' && s.connection !== 'connecting')
  // Refused, or no connection: say so with a way to try again, never shimmer forever.
  if (failed || offline) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-center text-[15px] text-muted">
          {offline ? `People will load once ${agentName()}'s back.` : "Couldn't load People."}
        </p>
        {!offline && (
          <button
            onClick={retryProfile}
            className="glass-pill min-h-11 rounded-[8px] px-5 text-[15px] font-semibold text-strong"
          >
            Try again
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="shimmer h-14 rounded-[6px] bg-text/6" />
      ))}
    </div>
  )
}

function Home({ onAdd, onGroup, onBlocked }: { onAdd: () => void; onGroup: () => void; onBlocked: () => void }) {
  const { friends, threads } = useSocial()
  const requests = useMemo(() => incomingRequests(friends), [friends])
  const list = useMemo(() => threadList(threads), [threads])
  const accepted = friends.filter((f) => f.status === 'accepted')
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing')

  return (
    // One column no wider than the window: a long message preview truncates instead of widening it.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap gap-2">
        <motion.button
          whileTap={press}
          onClick={onAdd}
          className="glass-pill flex h-12 min-w-0 flex-1 items-center gap-3 rounded-[8px] px-4 text-left text-[15px] font-semibold text-strong"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          Add a friend
        </motion.button>
        {accepted.length > 0 && (
          <motion.button
            whileTap={press}
            onClick={onGroup}
            className="glass-pill flex h-12 min-w-0 flex-1 items-center gap-3 rounded-[8px] px-4 text-left text-[15px] font-semibold text-strong"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" aria-hidden>
              <circle cx="6" cy="6" r="2.4" stroke="currentColor" strokeWidth={1.6} fill="none" />
              <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth={1.6} fill="none" />
              <path
                d="M1.8 13.5c.6-2.3 2.2-3.4 4.2-3.4s3.6 1.1 4.2 3.4M10.2 10.3c1.8-.2 3.3.8 3.9 3.2"
                stroke="currentColor"
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            New group
          </motion.button>
        )}
      </div>

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
  icon,
  name,
  note,
  onClick,
  children,
}: {
  who: { displayName: string | null; handle: string | null; avatarPath?: string | null }
  /** In place of their picture (an assistant conversation shows the assistant's). */
  icon?: React.ReactNode
  /** In place of their name (an assistant conversation says whose). */
  name?: React.ReactNode
  note?: React.ReactNode
  onClick?: () => void
  children?: React.ReactNode
}) {
  const main = (
    <>
      {icon ?? <Avatar who={who} />}
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
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2.5 last:border-0"
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
  const blocks = useSocial((s) => s.blocks)
  const names = useSocial((s) => s.names)
  const me = useSocial((s) => s.profile?.userId ?? null)
  const group = t.kind === 'group'
  // In a group, who said the last thing: "Sam: …" (yours "You: …"; an agent's is their assistant).
  const first = (id: string) => nameOf(personIn(t, id, names)).split(/\s+/)[0]
  const by =
    !group || !last
      ? ''
      : last.senderKind === 'agent'
        ? `${last.senderId === me ? 'Your' : `${first(last.senderId)}'s`} assistant: `
        : last.senderId === me
          ? 'You: '
          : `${first(last.senderId)}: `
  const line = !last
    ? 'No messages yet'
    : hiddenFrom(last, t, blocks)
      ? 'Hidden message'
      : last.deletedAt
        ? 'Message deleted'
        : by + last.body
  const who = t.members[0] ?? { displayName: threadName(t), handle: null }
  // A friend's assistant: the picture its owner chose for it (or the default assistant tile).
  const assistantPath = useSocial(
    (s) => s.friends.find((f) => f.profile.userId === t.ownerId)?.profile.assistantAvatarPath ?? null,
  )
  return (
    <Row
      who={who}
      icon={
        group ? (
          <StackedAvatars who={t.members} />
        ) : t.kind === 'assistant' && t.role !== 'owner' ? (
          <AssistantAvatar path={assistantPath} />
        ) : undefined
      }
      name={
        t.kind === 'assistant' ? (
          <>
            {threadName(t)} <AiTag />
          </>
        ) : group ? (
          threadName(t)
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
      <motion.button
        whileTap={press}
        onClick={() => openDmWith(id)}
        className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-strong"
      >
        Message
      </motion.button>
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
      {/* The extra actions get their own line under the name, so a narrow phone never scrolls sideways. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="acts"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={morph}
            className="flex basis-full flex-wrap gap-2 overflow-hidden pl-[52px]"
          >
            {assistant && (
              <motion.button
                whileTap={press}
                onClick={() => openAssistant(id)}
                className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-strong"
              >
                Their assistant
              </motion.button>
            )}
            <Confirm label="Unfriend" ask="Unfriend?" tone="muted" onConfirm={() => void removeFriend(id)} />
            <Confirm label="Block" ask="Block?" onConfirm={() => void blockUser(id)} />
          </motion.div>
        )}
      </AnimatePresence>
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
