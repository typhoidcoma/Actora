import { create } from 'zustand'
import type { BlockRow, DmMessage, FriendRow, Invite, OwnProfile, Pending, Profile, Thread } from '../social/types'

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

/** The state after one message lands (idempotent: the same message twice changes nothing more). */
export function withMessage(
  s: Pick<SocialState, 'messages' | 'threads'>,
  m: DmMessage,
  me: string | null,
): Pick<SocialState, 'messages' | 'threads'> {
  const byThread = s.messages[m.threadId] ?? {}
  const prev = byThread[m.seq]
  const messages = newer(m, prev) ? { ...s.messages, [m.threadId]: { ...byThread, [m.seq]: m } } : s.messages
  const t = s.threads[m.threadId]
  if (!t) return { messages, threads: s.threads }
  const next = { ...t }
  if (m.seq >= t.lastSeq) {
    next.lastSeq = m.seq
    next.lastMessage = m
    next.lastMessageAt = m.createdAt
  } else if (t.lastMessage?.seq === m.seq) next.lastMessage = m
  if (!prev && m.seq > t.lastReadSeq && m.senderId !== me && !m.deletedAt) next.unread = t.unread + 1
  return { messages, threads: { ...s.threads, [t.id]: next } }
}

/** After the read position moves: exact when caught up, else counted from what's loaded. */
export function unreadAfterRead(t: Thread, byThread: Record<number, DmMessage> | undefined, me: string | null): number {
  if (t.lastReadSeq >= t.lastSeq) return 0
  return Object.values(byThread ?? {}).filter((m) => m.seq > t.lastReadSeq && !m.deletedAt && m.senderId !== me)
    .length
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
  if (t.title?.trim()) return t.title.trim()
  return t.members.length ? t.members.map(nameOf).join(', ') : 'Just you'
}

/** What's waiting in People: unread messages plus friend requests (the menu's badge). */
export const usePeopleWaiting = () =>
  useSocial((s) => totalUnread(s.threads) + incomingRequests(s.friends).length)

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
    from: t.title?.trim() || nameOf(sender),
    count: t.unread,
    more: unread.length - 1,
    at: t.lastMessageAt!,
    score: Math.round(score),
  }
}
