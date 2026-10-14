import type { ServerFrame } from '../aelora/protocol'
import type { FrameBus } from '../aelora/socket'
import { useAgent } from '../stores/agent'
import {
  baselineOf,
  contiguousTop,
  nameOf,
  recount,
  social,
  useSocial,
  withMessage,
  type SocialState,
} from '../stores/social'
import { useEntities } from '../stores/entities'
import { toast } from '../stores/toast'
import { play } from '../sound/sound'
import { ui, useUi } from '../stores/ui'
import type { AssistantPreview, BlockRow, DmMessage, FriendRow, OwnProfile, Pending, Profile, Thread } from './types'

/**
 * Friends and direct messages over the Aelora socket (Aelora docs/SOCIAL.md and
 * SOCIAL-CLIENT.md). Fire-and-forget: every reply is its own frame, handled in
 * handleSocialFrame. The four rules: dedupe by id/seq, order by seq, sync from
 * the highest *contiguous* seq, and mark read while a thread is on screen.
 */

const SEND_TIMEOUT_MS = 15_000
const BODY_MAX = 4000

let bus: FrameBus | null = null
const timers = new Map<string, ReturnType<typeof setTimeout>>()
/** The read position last asked for per thread (so a busy thread doesn't resend it). */
const readSent = new Map<string, number>()
/** dm.open asked for this person: show the thread when it comes back. */
let opening: { kind: 'dm' | 'assistant'; userId: string } | null = null
/** The handle last looked up: a slower reply to an earlier lookup is ignored. */
let lastFind = ''
/** A DM deep link (/?dm=<id>, a push) waiting for the thread list. */
let wantThread: string | null = null
/** Whether the invite being made is a "scan to be friends" one. */
let inviteAuto = false

/** ?invite=<token>, read once and taken out of the address bar; redeemed once you have a handle. */
let pendingInvite: string | null = (() => {
  if (typeof location === 'undefined' || typeof history === 'undefined') return null
  const url = new URL(location.href)
  const token = url.searchParams.get('invite')
  if (token) {
    url.searchParams.delete('invite')
    history.replaceState(history.state, '', url)
  }
  return token
})()

const me = (): string | null => useSocial.getState().profile?.userId ?? useAgent.getState().userId

function out(msg: { type: string } & Record<string, unknown>): boolean {
  return bus?.send(msg) ?? false
}

// ---- connect ----

let focusHooked = false

/** After every hello (a token refresh is a reconnect too): the connect sequence. */
export function socialConnected(b: FrameBus): void {
  bus = b
  readSent.clear()
  b.send({ type: 'profile.get' })
  b.send({ type: 'friends.list' })
  b.send({ type: 'dm.threads' })
  sync()
  // Anything still on its way is safe to resend: clientMsgId makes it idempotent.
  for (const p of Object.values(useSocial.getState().pending)) if (p.state === 'sending') transmit(p)
  if (!focusHooked && typeof window !== 'undefined') {
    focusHooked = true
    // friends.changed only reaches sockets on the same server instance: refetch on focus too.
    window.addEventListener('focus', () => {
      if (useSocial.getState().profile) out({ type: 'friends.list' })
    })
  }
}

/** For tests: forget the socket and timers. */
export function resetSocialLink(): void {
  bus = null
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  readSent.clear()
  opening = null
  wantThread = null
}

/** For tests: pretend the page loaded with ?invite=. */
export function setPendingInvite(token: string | null): void {
  pendingInvite = token
}

function sync(only?: string[]): void {
  const { messages } = useSocial.getState()
  const since: Record<string, number> = {}
  for (const id of only ?? Object.keys(messages)) since[id] = contiguousTop(messages[id])
  if (Object.keys(since).length) out({ type: 'dm.sync', since })
}

// ---- actions ----

/** Claim (or change) your handle. A leading @ is fine. */
export function claimHandle(handle: string, displayName?: string): void {
  social.setError('claim', null)
  out({ type: 'profile.claim', handle: handle.trim().replace(/^@/, ''), ...(displayName?.trim() ? { displayName: displayName.trim() } : {}) })
}

/** Your display name ("" clears it) and who can find you. */
export function updateProfile(p: {
  displayName?: string
  discoverable?: boolean
  emailDiscoverable?: boolean
  /** Receptionist mode: whether friends can message your agent. */
  assistantMode?: 'off' | 'friends'
  /** A note she can share ("" clears it; the server cuts it at 1000 characters). */
  assistantAbout?: string
  assistantSharedCategories?: string[]
}): void {
  social.setError('profile', null)
  out({ type: 'profile.update', ...p })
}

/** What friends' messages can make your receptionist share: exactly the query she uses. */
export function loadAssistantPreview(): void {
  social.setError('preview', null)
  out({ type: 'assistant.preview' })
}

/**
 * Keep one thing from your receptionist even though its section is shared.
 * Goals come from the goals table (goal.update); everything else is a vault entry.
 */
export function hideFromAssistant(id: string, hidden = true): void {
  const isGoal = !!useEntities.getState().goals[id]
  out({ type: isGoal ? 'goal.update' : 'vault.update', id, patch: { assistant_hidden: hidden } })
  // Gone from the preview at once; the fresh preview confirms it.
  useSocial.setState((s) =>
    s.preview ? { preview: { ...s.preview, entries: s.preview.entries.filter((e) => e.id !== id) } } : {},
  )
  loadAssistantPreview()
}

/** Exact handle only: a miss is "no one", deliberately the same as hidden or blocked. */
export function findHandle(handle: string): void {
  const h = handle.trim().replace(/^@/, '').toLowerCase()
  if (!h) return
  social.setError('find', null)
  lastFind = h
  useSocial.setState({ finding: true, found: null })
  if (!out({ type: 'friends.find', handle: h })) useSocial.setState({ finding: false })
}

export function clearFound(): void {
  useSocial.setState({ found: null, finding: false })
  social.setError('find', null)
}

export const requestFriend = (userId: string) => out({ type: 'friends.request', userId })
export const respondFriend = (userId: string, accept: boolean) => out({ type: 'friends.respond', userId, accept })
/** Unfriend, or take back your own request. */
export const removeFriend = (userId: string) => out({ type: 'friends.remove', userId })
export const blockUser = (userId: string) => out({ type: 'friends.block', userId })
export const unblockUser = (userId: string) => out({ type: 'friends.unblock', userId })
export const loadBlocks = () => out({ type: 'friends.blocks' })

/** A link to share; autoAccept makes a "scan to be friends" QR. */
export function createInvite(autoAccept: boolean): void {
  social.setError('invite', null)
  inviteAuto = autoAccept
  useSocial.setState({ invite: null })
  out({ type: 'friends.invite.create', autoAccept, ...(autoAccept ? { maxUses: 1, ttlHours: 24 } : {}) })
}

/** Start (or reopen) a conversation with a friend; People shows it when it comes back. */
export function openDmWith(userId: string): void {
  const existing = Object.values(useSocial.getState().threads).find(
    (t) => t.kind === 'dm' && t.members.length === 1 && t.members[0]!.userId === userId,
  )
  if (existing) return ui.openDm(existing.id)
  opening = { kind: 'dm', userId }
  out({ type: 'dm.open', userId })
}

/** Talk to a friend's receptionist (their agent): an ordinary thread of kind 'assistant'. */
export function openAssistant(ownerId: string): void {
  const existing = Object.values(useSocial.getState().threads).find(
    (t) => t.kind === 'assistant' && t.ownerId === ownerId && t.role !== 'owner',
  )
  if (existing) return ui.openDm(existing.id)
  opening = { kind: 'assistant', userId: ownerId }
  out({ type: 'assistant.open', userId: ownerId })
}

/** Open a thread from a link or push: now if it's known, else when the list arrives. */
export function showThread(threadId: string): void {
  if (useSocial.getState().threads[threadId]) ui.openPeople(threadId)
  else {
    wantThread = threadId
    ui.openPeople()
  }
}

/** On opening a thread: its latest page (also catches edits made while away). */
export function openThread(threadId: string): void {
  history_(threadId)
}

export function loadOlder(threadId: string): void {
  const held = Object.keys(useSocial.getState().messages[threadId] ?? {}).map(Number)
  const oldest = held.length ? Math.min(...held) : 0
  if (oldest > 1) history_(threadId, oldest)
}

function history_(threadId: string, beforeSeq?: number): void {
  if (useSocial.getState().loading[threadId]) return
  if (out({ type: 'dm.history', threadId, ...(beforeSeq ? { beforeSeq } : {}) }))
    useSocial.setState((s) => ({ loading: { ...s.loading, [threadId]: true } }))
}

/** Optimistic: the bubble shows at once as "sending". */
export function sendDm(threadId: string, text: string): boolean {
  const body = text.trim()
  if (!body || body.length > BODY_MAX) return false
  const p: Pending = { clientMsgId: newId(), threadId, body, state: 'sending', at: Date.now() }
  useSocial.setState((s) => ({ pending: { ...s.pending, [p.clientMsgId]: p } }))
  play('sent')
  transmit(p)
  return true
}

/** Same clientMsgId: the server hands back the original if the first try landed after all. */
export function retryDm(clientMsgId: string): void {
  const p = useSocial.getState().pending[clientMsgId]
  if (!p) return
  const next: Pending = { ...p, state: 'sending', error: undefined }
  useSocial.setState((s) => ({ pending: { ...s.pending, [clientMsgId]: next } }))
  transmit(next)
}

export function discardDm(clientMsgId: string): void {
  clearTimer(clientMsgId)
  dropPending(clientMsgId)
}

/** While a thread is visible and focused, and as messages arrive into it. */
export function markRead(threadId: string): void {
  const s = useSocial.getState()
  const t = s.threads[threadId]
  const top = contiguousTop(s.messages[threadId])
  if (!t || top <= t.lastReadSeq || (readSent.get(threadId) ?? 0) >= top) return
  if (out({ type: 'dm.read', threadId, seq: top })) readSent.set(threadId, top)
}

export const editDm = (messageId: string, body: string) =>
  body.trim() && body.trim().length <= BODY_MAX && out({ type: 'dm.edit', messageId, body: body.trim() })
export const deleteDm = (messageId: string) => out({ type: 'dm.delete', messageId })
export const muteThread = (threadId: string, muted: boolean) => out({ type: 'dm.mute', threadId, muted })

function transmit(p: Pending): void {
  clearTimer(p.clientMsgId)
  // Nothing back in time (a dropped socket, or a burst limit that can't name the message): failed, with Retry.
  timers.set(
    p.clientMsgId,
    setTimeout(() => fail(p.clientMsgId, 'timeout'), SEND_TIMEOUT_MS),
  )
  out({ type: 'dm.send', threadId: p.threadId, body: p.body, clientMsgId: p.clientMsgId })
}

function fail(clientMsgId: string, code: string): void {
  clearTimer(clientMsgId)
  const p = useSocial.getState().pending[clientMsgId]
  if (!p) return
  useSocial.setState((s) => ({ pending: { ...s.pending, [clientMsgId]: { ...p, state: 'failed', error: code } } }))
}

function clearTimer(clientMsgId: string): void {
  const t = timers.get(clientMsgId)
  if (t) clearTimeout(t)
  timers.delete(clientMsgId)
}

function dropPending(clientMsgId: string | undefined): void {
  if (!clientMsgId || !useSocial.getState().pending[clientMsgId]) return
  useSocial.setState((s) => {
    const pending = { ...s.pending }
    delete pending[clientMsgId]
    return { pending }
  })
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function put(list: DmMessage[]): void {
  if (!list.length) return
  useSocial.setState((s) => {
    let next: Pick<SocialState, 'messages' | 'threads'> = { messages: s.messages, threads: s.threads }
    for (const m of list) next = withMessage({ ...next, baselines: s.baselines }, m, me())
    return next
  })
}

const isMessage = (m: unknown): m is DmMessage =>
  !!m && typeof m === 'object' && typeof (m as DmMessage).threadId === 'string' && typeof (m as DmMessage).seq === 'number'
const messageList = (v: unknown): DmMessage[] => (Array.isArray(v) ? v.filter(isMessage) : [])

// ---- inbound ----

/** Social frames (profile, friends.*, dm.* and their errors). True when handled. */
export function handleSocialFrame(f: ServerFrame, b: FrameBus): boolean {
  bus = b
  switch (f.type) {
    case 'profile': {
      const profile = (f.profile ?? null) as OwnProfile | null
      const was = useSocial.getState().profile
      useSocial.setState({ profile })
      if (profile) {
        social.setError('claim', null)
        // A handle just claimed: what was refused without one can load now.
        if (was === null) {
          out({ type: 'friends.list' })
          out({ type: 'dm.threads' })
        }
        if (pendingInvite) {
          out({ type: 'friends.invite.redeem', token: pendingInvite })
          pendingInvite = null
        }
      } else if (pendingInvite) ui.openPeople() // pick a handle first, then the invite goes through
      return true
    }

    case 'friends.list':
      useSocial.setState({ friends: Array.isArray(f.friends) ? (f.friends as FriendRow[]) : [] })
      return true
    case 'friends.changed':
    case 'friends.requested':
    case 'friends.responded':
    case 'friends.removed':
      out({ type: 'friends.list' })
      return true
    case 'friends.blocked':
    case 'friends.unblocked':
      out({ type: 'friends.list' })
      out({ type: 'friends.blocks' })
      out({ type: 'dm.threads' })
      return true
    case 'friends.blocks':
      useSocial.setState({ blocks: Array.isArray(f.blocks) ? (f.blocks as BlockRow[]) : [] })
      return true
    case 'friends.found': {
      // query echoes the raw input ({handle} or {email}): an earlier lookup's late reply isn't this one.
      const query = typeof f.query === 'object' && f.query ? String(Object.values(f.query)[0] ?? '') : String(f.query ?? '')
      if (lastFind && query.replace(/^@/, '').toLowerCase() !== lastFind) return true
      useSocial.setState({ finding: false, found: { query, profile: (f.profile ?? null) as Profile | null } })
      return true
    }
    case 'friends.invite': {
      const token = typeof f.token === 'string' ? f.token : ''
      if (!token) return true
      const origin = typeof location !== 'undefined' ? location.origin : ''
      useSocial.setState({
        invite: {
          id: String(f.id ?? ''),
          url: `${origin}/?invite=${token}`,
          autoAccept: inviteAuto,
          expiresAt: String(f.expiresAt ?? ''),
        },
      })
      return true
    }
    case 'friends.invite.redeemed': {
      out({ type: 'friends.list' })
      const who = nameOf((f.inviter ?? null) as Profile | null)
      toast.show(f.status === 'accepted' ? `You and ${who} are friends` : `Friend request sent to ${who}`)
      return true
    }

    case 'dm.threads': {
      const list = Array.isArray(f.threads) ? (f.threads as Thread[]) : []
      // The server's counts are the truth whenever it sends them: recount from here.
      useSocial.setState({
        threads: Object.fromEntries(list.map((t) => [t.id, t])),
        baselines: Object.fromEntries(list.map((t) => [t.id, baselineOf(t)])),
      })
      if (wantThread) {
        const id = wantThread
        wantThread = null
        if (list.some((t) => t.id === id) && useUi.getState().people) ui.openDm(id)
      }
      return true
    }
    case 'dm.thread': {
      const t = f.thread as Thread | undefined
      if (!t?.id) return true
      useSocial.setState((s) => ({
        threads: { ...s.threads, [t.id]: t },
        baselines: { ...s.baselines, [t.id]: baselineOf(t) },
      }))
      const asked = opening
      const answers =
        asked &&
        (asked.kind === 'assistant'
          ? t.kind === 'assistant' && t.ownerId === asked.userId
          : t.kind === 'dm' && t.members.some((m) => m.userId === asked.userId))
      if (answers) {
        opening = null
        if (useUi.getState().people) ui.openDm(t.id)
      }
      return true
    }
    case 'dm.membership':
      out({ type: 'dm.threads' })
      return true
    case 'dm.resync':
      sync()
      return true

    case 'dm.history': {
      const threadId = String(f.threadId ?? '')
      put(messageList(f.messages))
      useSocial.setState((s) => ({ loading: { ...s.loading, [threadId]: false } }))
      return true
    }
    case 'dm.synced': {
      const threads = Array.isArray(f.threads) ? (f.threads as Array<{ threadId: string; messages: unknown; more?: boolean }>) : []
      for (const t of threads) {
        put(messageList(t.messages))
        if (t.more) sync([t.threadId]) // a long gap comes in pages
      }
      return true
    }

    case 'dm.sent': {
      const clientMsgId = String(f.clientMsgId ?? '')
      clearTimer(clientMsgId)
      if (isMessage(f.message)) put([f.message])
      dropPending(clientMsgId)
      return true
    }
    case 'dm.message':
    case 'dm.updated':
    case 'dm.edited':
    case 'dm.deleted':
      if (isMessage(f.message)) {
        const m = f.message
        // A new message from someone else (a friend, or a friend's assistant): a soft tone,
        // unless that conversation is muted or already open in front of you.
        if (f.type === 'dm.message' && m.senderId !== me() && !m.deletedAt) {
          const t = useSocial.getState().threads[m.threadId]
          const u = useUi.getState()
          const looking =
            u.people && u.dmThread === m.threadId && typeof document !== 'undefined' && document.hasFocus()
          if (!t?.muted && !looking) play('message')
        }
        put([f.message])
        // Ours from another device (or the echo of this one) clears a matching bubble.
        clearTimer(f.message.clientMsgId)
        dropPending(f.message.clientMsgId)
      }
      return true

    case 'dm.read':
    case 'dm.state':
    case 'dm.muted': {
      const threadId = String(f.threadId ?? '')
      useSocial.setState((s) => {
        const t = s.threads[threadId]
        if (!t) return {}
        const next = { ...t }
        if (typeof f.muted === 'boolean') next.muted = f.muted
        if (typeof f.lastReadSeq === 'number' && f.lastReadSeq > t.lastReadSeq) {
          next.lastReadSeq = f.lastReadSeq
          next.unread = recount(next, s.messages[threadId], s.baselines[threadId], me())
        }
        return { threads: { ...s.threads, [threadId]: next } }
      })
      return true
    }

    // Exactly what a friend's message can make your receptionist share.
    case 'assistant.preview': {
      const p: AssistantPreview = {
        mode: f.mode === 'friends' ? 'friends' : 'off',
        about: typeof f.about === 'string' ? f.about : null,
        categories: Array.isArray(f.categories) ? (f.categories as string[]) : [],
        entries: Array.isArray(f.entries) ? (f.entries as AssistantPreview['entries']) : [],
      }
      useSocial.setState({ preview: p })
      return true
    }

    case 'error':
      return socialError(f)
  }
  return false
}

const FORM_OF: Record<string, string> = {
  'profile.claim': 'claim',
  'profile.update': 'profile',
  'friends.find': 'find',
  'friends.invite.create': 'invite',
  'friends.invite.redeem': 'redeem',
  'assistant.preview': 'preview',
}

const SAY: Record<string, string> = {
  rate_limited: 'Too many at once. Try again in a minute',
  not_found: "That person isn't available",
  invalid_invite: "That invite link didn't work",
  social_unavailable: "People isn't available right now",
}

function socialError(f: ServerFrame): boolean {
  const request = typeof f.request === 'string' ? f.request : ''
  if (!/^(profile|friends|dm|assistant)\./.test(request)) return false
  const code = String(f.code ?? 'failed')

  if (code === 'guest_not_allowed') {
    useSocial.setState({ guest: true, profile: null })
    return true
  }
  if (code === 'profile_required') {
    useSocial.setState({ profile: null })
    return true
  }
  if (request === 'dm.send' && typeof f.clientMsgId === 'string') {
    fail(f.clientMsgId, code)
    return true
  }
  if (request === 'dm.history' && typeof f.threadId === 'string') {
    const id = f.threadId
    useSocial.setState((s) => ({ loading: { ...s.loading, [id]: false } }))
    return true
  }
  if (request === 'dm.open' || request === 'assistant.open') opening = null

  const form = FORM_OF[request]
  if (form) {
    social.setError(form, code)
    if (form === 'find') useSocial.setState({ finding: false })
    if (form === 'redeem') toast.error(SAY.invalid_invite!)
    return true
  }
  // Things you did (a request, a block, an edit): say it didn't go through.
  if (!/\.(list|blocks|threads|sync|get)$/.test(request)) toast.error(SAY[code] ?? "That didn't go through")
  return true
}
