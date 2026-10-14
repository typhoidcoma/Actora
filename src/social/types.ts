// Aelora's social frames (Aelora docs/SOCIAL.md): handles, friends, blocks,
// invite links and person-to-person messages. None of it ever reaches Wendy.

export interface Profile {
  userId: string
  handle: string
  displayName: string | null
  avatarPath: string | null
}

/** Your own profile, with its privacy switches. */
export interface OwnProfile extends Profile {
  discoverable?: boolean
  emailDiscoverable?: boolean
}

export interface FriendRow {
  profile: Profile
  status: 'pending' | 'accepted'
  /** Who asked: null once accepted. */
  direction: 'incoming' | 'outgoing' | null
  since: string
}

export interface BlockRow {
  userId: string
  handle: string | null
  blockedAt: string
}

export interface Member {
  userId: string
  role: string
  handle: string | null
  displayName: string | null
  avatarPath: string | null
}

export interface DmMessage {
  id: string
  threadId: string
  /** Per thread, from 1, no gaps. Order by this, never by arrival. */
  seq: number
  senderId: string
  senderKind: 'human' | 'agent'
  clientMsgId: string
  body: string
  createdAt: string
  editedAt: string | null
  /** Deleted messages keep their row (and seq) and lose their text. */
  deletedAt: string | null
}

export interface Thread {
  id: string
  kind: 'dm' | 'group'
  title: string | null
  lastSeq: number
  lastMessageAt: string | null
  createdAt?: string
  lastReadSeq: number
  muted: boolean
  role?: string
  unread: number
  /** The *other* active members. */
  members: Member[]
  lastMessage: DmMessage | null
}

/** A message on its way: shown at once, replaced by the real one when it lands. */
export interface Pending {
  clientMsgId: string
  threadId: string
  body: string
  state: 'sending' | 'failed'
  error?: string
  at: number
}

/** A link made by friends.invite.create: the token is only ever shown once. */
export interface Invite {
  id: string
  url: string
  autoAccept: boolean
  expiresAt: string
}
