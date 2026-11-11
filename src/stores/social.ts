import { create } from 'zustand'
import type {
  AssistantPreview,
  BlockRow,
  DmMessage,
  FriendRow,
  Invite,
  Member,
  OwnProfile,
  Pending,
  Profile,
  Thread,
} from '../social/types'

/**
 * Friends and direct messages (Aelora's social frames; src/social/social.ts
 * talks to the server). Messages are keyed by thread and seq, never appended:
 * the same one can arrive three times (dm.sent, dm.message, dm.sync) and in any
 * order, so the map dedupes and rendering sorts.
 */
export interface SocialState {
  /** undefined: not loaded yet; null: no handle yet (pick one first). */
  profile: OwnProfile | null | undefined
  /** An anonymous account: the server refuses all of this. */
  guest: boolean
  friends: FriendRow[]
  blocks: BlockRow[]
  threads: Record<string, Thread>
  /** threadId → seq → message. */
  messages: Record<string, Record<number, DmMessage>>
  /** clientMsgId → a message on its way. */
  pending: Record<string, Pending>
  /** Threads whose history is being fetched (so "Load earlier" can't double up). */
  loading: Record<string, boolean>
  /** The last handle lookup: profile null is "no one by that name" (or hidden, on purpose). */
  found: { query: string; profile: Profile | null } | null
  finding: boolean
  invite: Invite | null
  /** Per thread: the server's unread count and what it covered (recount works from it). */
  baselines: Record<string, Baseline>
  /** What friends' messages can make your receptionist share (assistant.preview), when loaded. */
  preview: AssistantPreview | null
  /** Inline errors by form: 'claim' (pick a handle), 'find', 'invite', 'redeem'. */
  errors: Record<string, string | null>
  /**
   * Everyone seen in a thread, by userId: someone who left a group drops out of
   * its members, but their old messages still need a name and a face.
   */
  names: Record<string, Known>
}

export type Known = Pick<Member, 'displayName' | 'handle' | 'avatarPath'>

const EMPTY: SocialState = {
  profile: undefined,
  guest: false,
  friends: [],
  blocks: [],
  threads: {},
  messages: {},
  pending: {},
  loading: {},
  baselines: {},
  preview: null,
  found: null,
  finding: false,
  invite: null,
  errors: {},
  names: {},
}

export const useSocial = create<SocialState>(() => ({ ...EMPTY }))

export const social = {
  /** Someone else signed in: nothing of the last person's stays. */
  reset: () => useSocial.setState({ ...EMPTY }),
  setError: (form: string, code: string | null) =>
    useSocial.setState((s) => ({ errors: { ...s.errors, [form]: code } })),
}

// ---- pure helpers (unit-tested) ----

/** Most recent first. */
export function threadList(threads: Record<string, Thread>): Thread[] {
  return Object.values(threads).sort((a, b) =>
    (b.lastMessageAt ?? b.createdAt ?? '').localeCompare(a.lastMessageAt ?? a.createdAt ?? ''),
  )
}

export function messagesFor(messages: SocialState['messages'], threadId: string): DmMessage[] {
  return Object.values(messages[threadId] ?? {}).sort((a, b) => a.seq - b.seq)
}

export function pendingFor(pending: SocialState['pending'], threadId: string): Pending[] {
  return Object.values(pending)
    .filter((p) => p.threadId === threadId)
    .sort((a, b) => a.at - b.at)
}

/**
 * The highest seq with nothing missing below it, down to the oldest message
 * held. Sync from here, not the highest: holding 1–7 and a live 10, "since 10"
 * would never fetch 8–9.
 */
export function contiguousTop(byThread: Record<number, DmMessage> | undefined): number {
  const seqs = Object.keys(byThread ?? {})
    .map(Number)
    .sort((a, b) => a - b)
  if (!seqs.length) return 0
  let top = seqs[0]!
  for (const s of seqs) {
    if (s > top + 1) break
    top = s
  }
  return top
}

/** An edit or delete replaces the original; an older copy never overwrites a newer one. */
function newer(m: DmMessage, prev: DmMessage | undefined): boolean {
  if (!prev) return true
  return (m.deletedAt ?? m.editedAt ?? '') >= (prev.deletedAt ?? prev.editedAt ?? '')
}

/**
 * Yours to show on your side (and edit): sent by you, as a person. A receptionist
 * reply carries its owner's senderId, so senderId alone would put her words in
 * the owner's mouth.
 */
export const isMine = (m: Pick<DmMessage, 'senderId' | 'senderKind'>, me: string | null): boolean =>
  !!me && m.senderId === me && m.senderKind === 'human'

/** The server's unread count and what it covered, as of the last dm.threads / dm.thread. */
export interface Baseline {
  seq: number
  unread: number
  readSeq: number
}

export const baselineOf = (t: Thread): Baseline => ({ seq: t.lastSeq, unread: t.unread, readSeq: t.lastReadSeq })

/**
 * Unread, recomputed (never incremented, so history, sync and out-of-order live
 * frames can't double-count): what's left of the server's count, less what's
 * been read of its window since, plus loaded messages past it from someone
 * else, not deleted. A message "from" me (mine, or my receptionist's reply,
 * which the server counts as mine) never counts. As Aelora's reference store.
 */
export function recount(
  t: Pick<Thread, 'lastReadSeq'>,
  byThread: Record<number, DmMessage> | undefined,
  base: Baseline | undefined,
  me: string | null,
): number {
  const b = base ?? { seq: 0, unread: 0, readSeq: 0 }
  const counts = (m: DmMessage) => m.senderId !== me && !m.deletedAt
  const loaded = Object.values(byThread ?? {})
  let fromServer = 0
  if (t.lastReadSeq < b.seq) {
    const readSince = loaded.filter((m) => m.seq > b.readSeq && m.seq <= t.lastReadSeq && counts(m)).length
    fromServer = Math.max(0, b.unread - readSince)
  }
  const since = loaded.filter((m) => m.seq > Math.max(b.seq, t.lastReadSeq) && counts(m)).length
  return fromServer + since
}

/** The state after one message lands (idempotent: the same message twice changes nothing more). */
export function withMessage(
  s: Pick<SocialState, 'messages' | 'threads' | 'baselines'>,
  m: DmMessage,
  me: string | null,
): Pick<SocialState, 'messages' | 'threads'> {
  const byThread = s.messages[m.threadId] ?? {}
  const prev = byThread[m.seq]
  const nextThread = newer(m, prev) ? { ...byThread, [m.seq]: m } : byThread
  const messages = nextThread === byThread ? s.messages : { ...s.messages, [m.threadId]: nextThread }
  const t = s.threads[m.threadId]
  if (!t) return { messages, threads: s.threads }
  const next = { ...t }
  if (m.seq >= t.lastSeq) {
    next.lastSeq = m.seq
    next.lastMessage = m
    next.lastMessageAt = m.createdAt
  } else if (t.lastMessage?.seq === m.seq) next.lastMessage = m
  // Sending marks a thread read up to your message (and a receptionist reply does
  // the same for its owner, whose senderId it carries): mirror the server.
  if (m.senderId === me && m.seq > next.lastReadSeq) next.lastReadSeq = m.seq
  next.unread = recount(next, nextThread, s.baselines[t.id], me)
  return { messages, threads: { ...s.threads, [t.id]: next } }
}

/** Unread messages across threads you haven't muted. */
export function totalUnread(threads: Record<string, Thread>): number {
  return Object.values(threads).reduce((n, t) => n + (t.muted ? 0 : t.unread), 0)
}

export function incomingRequests(friends: FriendRow[]): FriendRow[] {
  return friends.filter((f) => f.status === 'pending' && f.direction === 'incoming')
}

/** What to call someone: their display name, else @handle. */
export function nameOf(p: { displayName: string | null; handle: string | null } | null | undefined): string {
  return p?.displayName?.trim() || (p?.handle ? `@${p.handle}` : 'Someone')
}

export function threadName(t: Thread): string {
  if (t.kind === 'assistant') {
    // Yours (a friend talking to your receptionist), or a friend's that you're talking to.
    if (t.role === 'owner') return `${nameOf(t.members[0])} · your assistant`
    return `${ownerName(t)}'s assistant`
  }
  if (t.title?.trim()) return t.title.trim()
  return t.members.length ? t.members.map(nameOf).join(', ') : 'Just you'
}

/** Whose agent answers in an assistant thread (as a friend sees it). */
export function ownerName(t: Thread): string {
  return nameOf(t.members.find((m) => m.userId === t.ownerId) ?? t.members[0])
}

/** The names cache with these threads' members folded in (nobody is ever dropped from it). */
export function withNames(names: Record<string, Known>, threads: Thread[]): Record<string, Known> {
  let next = names
  for (const t of threads)
    for (const m of t.members) {
      const prev = next[m.userId]
      if (prev && prev.displayName === m.displayName && prev.handle === m.handle && prev.avatarPath === m.avatarPath)
        continue
      if (next === names) next = { ...names }
      next[m.userId] = { displayName: m.displayName, handle: m.handle, avatarPath: m.avatarPath }
    }
  return next
}

/** Who wrote something in a thread: a member now, else someone seen before, else null ("Someone"). */
export function personIn(t: Thread, userId: string, names: Record<string, Known> = {}): Known | null {
  return t.members.find((m) => m.userId === userId) ?? names[userId] ?? null
}

/**
 * A group message from someone you've blocked: hidden on your side. Blocks don't
 * take anyone out of a group and the server still delivers their messages, so
 * this is the client's job. Its row stays (as "Hidden message"), so seqs line up.
 */
export function hiddenFrom(m: Pick<DmMessage, 'senderId'>, t: Pick<Thread, 'kind'>, blocks: BlockRow[]): boolean {
  return t.kind === 'group' && blocks.some((b) => b.userId === m.senderId)
}

/** How one message shows: which side, a label over it, and whether it's an agent's (AI) words. */
export interface Speaker {
  side: 'me' | 'them'
  label: string | null
  agent: boolean
  /** The server lets you edit/delete it (yours, or your receptionist's reply). */
  editable: boolean
}

/**
 * In a receptionist thread an agent reply carries its owner's senderId, so it's
 * labelled as the assistant's (AI), never as the owner; the owner writing in
 * person is labelled with their name for the friend. Elsewhere: yours or theirs.
 */
export function speakerOf(m: DmMessage, t: Thread, me: string | null, names: Record<string, Known> = {}): Speaker {
  const mine = isMine(m, me)
  if (t.kind === 'group') {
    // Many voices: each of theirs is named. An agent reply carries its owner's
    // senderId, so it's the owner's assistant (AI), never the owner.
    if (m.senderKind === 'agent')
      return m.senderId === me
        ? { side: 'me', label: 'Your assistant (AI)', agent: true, editable: true }
        : {
            side: 'them',
            label: `${nameOf(personIn(t, m.senderId, names))}'s assistant (AI)`,
            agent: true,
            editable: false,
          }
    if (mine) return { side: 'me', label: null, agent: false, editable: true }
    return { side: 'them', label: nameOf(personIn(t, m.senderId, names)), agent: false, editable: false }
  }
  if (t.kind !== 'assistant') return { side: mine ? 'me' : 'them', label: null, agent: false, editable: mine }
  const owner = t.role === 'owner'
  if (m.senderKind === 'agent')
    return owner
      ? { side: 'me', label: 'Your assistant (AI)', agent: true, editable: m.senderId === me }
      : { side: 'them', label: `${ownerName(t)}'s assistant (AI)`, agent: true, editable: false }
  if (mine) return { side: 'me', label: null, agent: false, editable: true }
  // The owner stepping in themselves, as the friend sees it.
  if (!owner && m.senderId === t.ownerId) return { side: 'them', label: ownerName(t), agent: false, editable: false }
  return { side: 'them', label: null, agent: false, editable: false }
}

/** What's waiting in People: unread messages plus friend requests (the menu's badge). */
export const usePeopleWaiting = () => useSocial((s) => totalUnread(s.threads) + incomingRequests(s.friends).length)

/** One conversation on the home Chats card: who, how many unread, when. Never what was said. */
export interface ChatRow {
  threadId: string
  name: string
  kind: Thread['kind']
  /** A friend's assistant you're talking to (shown with "AI"); your own receptionist's threads are a person's. */
  theirAssistant: boolean
  /** 0 when muted: a muted chat never calls for attention. */
  unread: number
  at: string | null
  /** For the little faces: the other members (a group's first few). */
  faces: Known[]
}

/** The Chats box on home: always there, so the user always knows where chat lives. */
export interface ChatsCardData {
  rows: ChatRow[]
  /** Unread across chats that aren't muted. */
  unread: number
  /** 0–100, comparable with the priority cards': fresh mail ranks high, then sinks. 0 with nothing unread. */
  score: number
  /** The newest unread, unmuted chat: where a single tap on the card takes you. */
  topUnread: string | null
}

/** How many conversations the card lists at most. */
export const CHAT_ROWS = 4

/**
 * The Chats card: conversations waiting on you first, then the most recent.
 * Its score follows the newest unread: fresh within ten minutes it ranks with
 * things due soon, over the next hour it sinks to the level of calm items.
 * On phones that decides whether Chats leads the column.
 */
export function chatsCard(threads: Record<string, Thread>, now = Date.now()): ChatsCardData {
  const all = threadList(threads)
  const waiting = (t: Thread) => !t.muted && t.unread > 0
  const unread = all.filter((t) => waiting(t) && t.lastMessageAt)
  const top = unread[0]
  let score = 0
  if (top) {
    const mins = Math.max(0, (now - Date.parse(top.lastMessageAt!)) / 60_000)
    score = Math.round(mins <= 10 ? 82 : mins <= 60 ? 82 - ((mins - 10) / 50) * 42 : 30)
  }
  const ordered = [...all.filter(waiting), ...all.filter((t) => !waiting(t))]
  return {
    rows: ordered.slice(0, CHAT_ROWS).map((t) => ({
      threadId: t.id,
      name: threadName(t),
      kind: t.kind,
      theirAssistant: t.kind === 'assistant' && t.role !== 'owner',
      unread: t.muted ? 0 : t.unread,
      at: t.lastMessageAt ?? null,
      faces: t.members.slice(0, 3),
    })),
    unread: totalUnread(threads),
    score,
    topUnread: top?.id ?? null,
  }
}

/** A name as she may hear it: one line, short (names come from other users). */
export const spoken = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)

/**
 * What's waiting in People, for her screen state: how many unread messages and
 * who they're from, and who's asked to be friends. Never what anyone wrote.
 * Muted conversations are left out, as they are from the badge.
 */
export function waitingSummary(s: Pick<SocialState, 'threads' | 'friends'>): {
  unread: number
  from: Array<{ name: string; count: number }>
  requests: string[]
} {
  const live = threadList(s.threads).filter((t) => !t.muted && t.unread > 0)
  return {
    unread: live.reduce((n, t) => n + t.unread, 0),
    from: live.slice(0, 5).map((t) => ({
      // The person's name is capped; the "assistant" label goes after it, whole.
      name:
        t.kind !== 'assistant'
          ? spoken(t.title?.trim() || nameOf(t.members[0]))
          : t.role === 'owner'
            ? `${spoken(nameOf(t.members[0]))} · your assistant`
            : `${spoken(ownerName(t))}'s assistant`,
      count: t.unread,
    })),
    requests: incomingRequests(s.friends)
      .slice(0, 5)
      .map((r) => spoken(nameOf(r.profile))),
  }
}
