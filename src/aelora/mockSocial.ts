// The mock server's side of friends and DMs (Aelora docs/SOCIAL.md), so People
// can be tried without a second account: a friend (Sam) who writes back, a
// pending request (Priya), and a handle to claim first.

import type { DmMessage, FriendRow, OwnProfile, Profile, Thread } from '../social/types'
import type { ClientMessage, ServerFrame } from './protocol'

const ME = 'mock-user'
const iso = (minsAgo = 0) => new Date(Date.now() - minsAgo * 60_000).toISOString()
const uid = (): string => crypto.randomUUID()

const SAM: Profile = { userId: 'sam', handle: 'sam', displayName: 'Sam Rivera', avatarPath: null }
const PRIYA: Profile = { userId: 'priya', handle: 'priya_k', displayName: 'Priya', avatarPath: null }
const JO: Profile = { userId: 'jo', handle: 'jo', displayName: null, avatarPath: null }
const PEOPLE = [SAM, PRIYA, JO]
const REPLIES = ['Ha, same here', 'Sounds good to me', 'On my way 🙂', 'Can you send me the details?', 'Love that']

type Send = (f: ServerFrame) => void
type Later = (ms: number, make: () => ServerFrame) => void

export class MockSocial {
  profile: OwnProfile | null = null
  friends: FriendRow[] = [
    { profile: SAM, status: 'accepted', direction: null, since: iso(60 * 24 * 9) },
    { profile: PRIYA, status: 'pending', direction: 'incoming', since: iso(30) },
  ]
  blocks: Array<{ userId: string; handle: string; blockedAt: string }> = []
  threads = new Map<string, Thread>()
  messages = new Map<string, DmMessage[]>()

  constructor() {
    const t = this.newThread(SAM)
    const lines: Array<[string, string, number]> = [
      ['sam', 'Are we still on for the climb on Saturday?', 60 * 20],
      [ME, 'Yes! 9am at the gym?', 60 * 19],
      ['sam', 'Perfect. Bringing the new rope', 60 * 19 - 5],
      ['sam', 'Also, did you finish that book?', 14],
    ]
    for (const [from, body, ago] of lines) this.post(t.id, from, body, ago)
    t.lastReadSeq = 3
    t.unread = 1
  }

  /** True when the frame was a social one. */
  handle(msg: ClientMessage, send: Send, later: Later): boolean {
    const err = (code: string, extra: Record<string, unknown> = {}) =>
      send({ type: 'error', code, message: code, request: msg.type, ...extra })
    if (!/^(profile|friends|dm)\./.test(msg.type)) return false
    if (!this.profile && !['profile.get', 'profile.claim'].includes(msg.type)) {
      err('profile_required')
      return true
    }
    switch (msg.type) {
      case 'profile.get':
        send({ type: 'profile', profile: this.profile })
        break
      case 'profile.claim': {
        const h = String(msg.handle ?? '').toLowerCase()
        if (!/^[a-z0-9_]{3,20}$/.test(h)) err('invalid_handle')
        else if (['wendy', 'admin', 'support'].includes(h)) err('handle_reserved')
        else if (PEOPLE.some((p) => p.handle === h)) err('handle_taken')
        else {
          this.profile = { userId: ME, handle: h, displayName: (msg.displayName as string) || null, avatarPath: null }
          send({ type: 'profile', profile: this.profile })
        }
        break
      }
      case 'friends.list':
        send({ type: 'friends.list', friends: this.friends })
        break
      case 'friends.find': {
        const h = String(msg.handle ?? '').toLowerCase()
        const p = PEOPLE.find((x) => x.handle === h && !this.blocks.some((b) => b.userId === x.userId)) ?? null
        send({ type: 'friends.found', query: { handle: h }, profile: p })
        break
      }
      case 'friends.request': {
        const p = PEOPLE.find((x) => x.userId === msg.userId)
        if (!p) return err('not_found'), true
        const row = this.friends.find((f) => f.profile.userId === p.userId)
        if (row?.direction === 'incoming') row.status = 'accepted'
        else if (!row) this.friends.push({ profile: p, status: 'pending', direction: 'outgoing', since: iso() })
        send({ type: 'friends.requested', userId: p.userId, status: row ? 'accepted' : 'pending' })
        // Jo says yes after a moment.
        if (p === JO && !row)
          later(2500, () => {
            const r = this.friends.find((f) => f.profile.userId === JO.userId)
            if (r) Object.assign(r, { status: 'accepted', direction: null })
            return { type: 'friends.changed' }
          })
        break
      }
      case 'friends.respond': {
        const row = this.friends.find((f) => f.profile.userId === msg.userId && f.direction === 'incoming')
        if (!row) return err('not_found'), true
        if (msg.accept) Object.assign(row, { status: 'accepted', direction: null })
        else this.friends = this.friends.filter((f) => f !== row)
        send({ type: 'friends.responded', userId: msg.userId, status: msg.accept ? 'accepted' : 'declined' })
        break
      }
      case 'friends.remove':
        this.friends = this.friends.filter((f) => f.profile.userId !== msg.userId)
        send({ type: 'friends.removed', userId: msg.userId })
        break
      case 'friends.block': {
        const p = PEOPLE.find((x) => x.userId === msg.userId)
        this.friends = this.friends.filter((f) => f.profile.userId !== msg.userId)
        if (p) this.blocks.push({ userId: p.userId, handle: p.handle, blockedAt: iso() })
        for (const [id, t] of this.threads) if (t.members.some((m) => m.userId === msg.userId)) this.threads.delete(id)
        send({ type: 'friends.blocked', userId: msg.userId })
        break
      }
      case 'friends.unblock':
        this.blocks = this.blocks.filter((b) => b.userId !== msg.userId)
        send({ type: 'friends.unblocked', userId: msg.userId })
        break
      case 'friends.blocks':
        send({ type: 'friends.blocks', blocks: this.blocks })
        break
      case 'friends.invite.create':
        send({
          type: 'friends.invite',
          id: uid(),
          token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''),
          expiresAt: iso(-60 * 24 * 7),
        })
        break
      case 'friends.invite.redeem':
        err('invalid_invite')
        break

      case 'dm.threads':
        send({ type: 'dm.threads', threads: [...this.threads.values()] })
        break
      case 'dm.open': {
        const p = PEOPLE.find((x) => x.userId === msg.userId)
        const friend = this.friends.some((f) => f.profile.userId === msg.userId && f.status === 'accepted')
        if (!p || !friend) return err('not_found'), true
        const t = [...this.threads.values()].find((x) => x.members[0]?.userId === p.userId) ?? this.newThread(p)
        send({ type: 'dm.thread', thread: t })
        break
      }
      case 'dm.history': {
        const all = this.messages.get(String(msg.threadId)) ?? []
        const before = typeof msg.beforeSeq === 'number' ? msg.beforeSeq : Infinity
        const page = all.filter((m) => m.seq < before).slice(-50).reverse()
        send({ type: 'dm.history', threadId: msg.threadId, beforeSeq: msg.beforeSeq ?? null, messages: page })
        break
      }
      case 'dm.sync': {
        const since = (msg.since ?? {}) as Record<string, number>
        send({
          type: 'dm.synced',
          threads: Object.entries(since).map(([threadId, seq]) => ({
            threadId,
            messages: (this.messages.get(threadId) ?? []).filter((m) => m.seq > seq),
            more: false,
          })),
        })
        break
      }
      case 'dm.send': {
        const t = this.threads.get(String(msg.threadId))
        const body = String(msg.body ?? '').trim()
        if (!t) return err('not_found', { clientMsgId: msg.clientMsgId }), true
        if (!body || body.length > 4000) return err('bad_request', { clientMsgId: msg.clientMsgId }), true
        const dup = this.messages.get(t.id)?.find((m) => m.clientMsgId === msg.clientMsgId)
        const m = dup ?? this.post(t.id, ME, body, 0, String(msg.clientMsgId))
        t.lastReadSeq = m.seq
        t.unread = 0
        send({ type: 'dm.sent', clientMsgId: msg.clientMsgId, message: m })
        send({ type: 'dm.message', message: m })
        // They write back a moment later.
        const other = t.members[0]
        if (other && !dup) {
          const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)]!
          later(1800, () => ({ type: 'dm.message', message: this.post(t.id, other.userId, reply, 0) }))
        }
        break
      }
      case 'dm.read': {
        const t = this.threads.get(String(msg.threadId))
        if (!t) return err('not_found'), true
        t.lastReadSeq = Math.max(t.lastReadSeq, Math.min(Number(msg.seq) || 0, t.lastSeq))
        t.unread = (this.messages.get(t.id) ?? []).filter((m) => m.seq > t.lastReadSeq && m.senderId !== ME && !m.deletedAt).length
        send({ type: 'dm.read', threadId: t.id, lastReadSeq: t.lastReadSeq })
        break
      }
      case 'dm.mute': {
        const t = this.threads.get(String(msg.threadId))
        if (!t) return err('not_found'), true
        t.muted = !!msg.muted
        send({ type: 'dm.muted', threadId: t.id, muted: t.muted })
        break
      }
      case 'dm.edit':
      case 'dm.delete': {
        const m = [...this.messages.values()].flat().find((x) => x.id === msg.messageId && x.senderId === ME)
        if (!m) return err('not_found'), true
        if (msg.type === 'dm.edit') Object.assign(m, { body: String(msg.body).trim(), editedAt: iso() })
        else Object.assign(m, { body: '', deletedAt: iso() })
        send({ type: msg.type === 'dm.edit' ? 'dm.edited' : 'dm.deleted', message: { ...m } })
        break
      }
      default:
        err('bad_request')
    }
    return true
  }

  private newThread(p: Profile): Thread {
    const t: Thread = {
      id: uid(),
      kind: 'dm',
      title: null,
      lastSeq: 0,
      lastMessageAt: null,
      createdAt: iso(),
      lastReadSeq: 0,
      muted: false,
      unread: 0,
      members: [{ userId: p.userId, role: 'member', handle: p.handle, displayName: p.displayName, avatarPath: null }],
      lastMessage: null,
    }
    this.threads.set(t.id, t)
    this.messages.set(t.id, [])
    return t
  }

  private post(threadId: string, from: string, body: string, minsAgo: number, clientMsgId = uid()): DmMessage {
    const list = this.messages.get(threadId)!
    const t = this.threads.get(threadId)!
    const m: DmMessage = {
      id: uid(),
      threadId,
      seq: list.length + 1,
      senderId: from,
      senderKind: 'human',
      clientMsgId,
      body,
      createdAt: iso(minsAgo),
      editedAt: null,
      deletedAt: null,
    }
    list.push(m)
    Object.assign(t, { lastSeq: m.seq, lastMessage: m, lastMessageAt: m.createdAt })
    if (from !== ME && m.seq > t.lastReadSeq) t.unread++
    return m
  }
}
