// Aelora's social frames (Aelora docs/SOCIAL.md): handles, friends, blocks,
// invite links, person-to-person messages and receptionist mode. A message between
// people never reaches your Wendy; an 'assistant' thread is a friend deliberately
// talking to someone's agent, which the server answers in a separate, walled-off run.

export interface Profile {
  userId: string
  handle: string
  displayName: string | null
  avatarPath: string | null
  /** Their receptionist takes messages from friends (never says what they share). */
  assistantAvailable?: boolean
}

/** Your own profile, with its privacy switches. */
export interface OwnProfile extends Profile {
  discoverable?: boolean
  emailDiscoverable?: boolean
  /** Receptionist mode: friends can message your agent. */
  assistantMode?: 'off' | 'friends'
  /** A note she can share with friends (up to 1000 characters). */
  assistantAbout?: string | null
  /** Vault sections she may share (SHAREABLE below). */
  assistantSharedCategories?: string[]
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
  /** 'assistant': a friend talking to ownerId's agent (receptionist mode). */
  kind: 'dm' | 'group' | 'assistant'
  title: string | null
  /** Whose agent answers in an assistant thread; null otherwise. */
  ownerId?: string | null
  lastSeq: number
  lastMessageAt: string | null
  createdAt?: string
  lastReadSeq: number
  muted: boolean
  role?: 'owner' | 'admin' | 'member'
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

/** The vault sections a receptionist can share, with the names Aelora gives them. */
export const SHAREABLE: Array<{ id: string; label: string }> = [
  { id: 'identity', label: 'Core' },
  { id: 'goal', label: 'Goals' },
  { id: 'constraint', label: 'Constraints' },
  { id: 'preference', label: 'Preferences' },
  { id: 'routine', label: 'Routines' },
  { id: 'relationship', label: 'Relationships' },
  { id: 'skill', label: 'Skills' },
  { id: 'value', label: 'Values' },
  { id: 'milestone', label: 'Milestones' },
]

/** assistant.preview: exactly what a friend's message can make your receptionist share. */
export interface AssistantPreview {
  mode: 'off' | 'friends'
  about: string | null
  categories: string[]
  entries: Array<{ id: string; category: string; section: string; content: string }>
}
