import { create } from 'zustand'
import type {
  AssistantPreview,
  BlockRow,
  DmMessage,
  FriendRow,
  Invite,
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
}

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
export function speakerOf(m: DmMessage, t: Thread, me: string | null): Speaker {
  const mine = isMine(m, me)
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

/** A card on the home grid for unread messages: who wrote, never what (anyone can see the screen). */
export interface MessageCardData {
  threadId: string
  from: string
  /** Unread in that conversation. */
  count: number
  /** Other conversations with unread messages too. */
  more: number
  at: string
  /** 0–100, comparable with the priority cards': fresh mail ranks high, then sinks. */
  score: number
}

/**
 * The newest unread conversation (muted ones never count). Fresh within ten
 * minutes, it ranks with things due soon; over the next hour it sinks to the
 * level of calm items, and after that it only fills a free slot.
 */
export function messageCard(threads: Record<string, Thread>, now = Date.now()): MessageCardData | null {
  const unread = threadList(threads).filter((t) => !t.muted && t.unread > 0 && t.lastMessageAt)
  const t = unread[0]
  if (!t) return null
  const mins = Math.max(0, (now - Date.parse(t.lastMessageAt!)) / 60_000)
  const score = mins <= 10 ? 82 : mins <= 60 ? 82 - ((mins - 10) / 50) * 42 : 30
  const sender = t.members.find((m) => m.userId === t.lastMessage?.senderId) ?? t.members[0]
  return {
    threadId: t.id,
    from: t.kind === 'assistant' || t.title?.trim() ? threadName(t) : nameOf(sender),
    count: t.unread,
    more: unread.length - 1,
    at: t.lastMessageAt!,
    score: Math.round(score),
  }
}

/** A name as she may hear it: one line, short (names come from other users). */
const spoken = (s: string) =>
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
