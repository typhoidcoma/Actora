// Wire types for the Aelora WebSocket protocol.
// Source of truth: luminora-app/Aelora docs/WEBSOCKET.md and docs/FRONTEND.md.

export const PLUTCHIK = ['joy', 'trust', 'fear', 'surprise', 'sadness', 'disgust', 'anger', 'anticipation'] as const
export type PrimaryEmotion = (typeof PLUTCHIK)[number]

export type EmotionVector = Partial<Record<PrimaryEmotion, number>>

export interface MoodState {
  emotion: PrimaryEmotion | string
  intensity: 'low' | 'mid' | 'high'
  secondary?: PrimaryEmotion | string
  note?: string
  label?: string
  updatedAt?: string
}

export interface Task {
  id: string
  user_id?: string
  vault_id: string | null
  goal_id: string | null
  title: string
  status: 'todo' | 'committed' | 'in_progress' | 'done' | 'skipped'
  committed_at: string | null
  completed_at: string | null
  due_date: string | null
  estimated_minutes: number | null
  /** What the task is about, written by the agent (Aelora migration 052; absent on older servers). */
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  user_id?: string
  vault_id: string | null
  title: string
  description: string | null
  timeframe: 'day' | 'week' | 'month' | 'semester' | 'year' | null
  status: 'active' | 'completed' | 'paused'
  created_at: string
  updated_at: string
}

export interface CalendarOccurrence {
  id: string
  title: string
  description?: string | null
  start_time: string
  end_time: string
  all_day?: boolean
  location?: string | null
  color?: string | null
  rrule?: string | null
  is_recurring?: boolean
  /** Other people are invited: changing it from here makes Google email them. */
  has_guests?: boolean
  occurrence_start?: string | null
}

export interface Notification {
  id: string
  user_id?: string
  origin_type: 'wendy' | 'peer' | 'system'
  origin_user_id?: string | null
  title: string
  body: string | null
  scheduled_for: string | null
  sent_at: string | null
  read_at: string | null
  created_at: string
}

export interface TranscriptMessage {
  seq: number
  role: 'user' | 'assistant' | string
  content: string
  createdAt: string
}

export type ReactionBus = 'positive' | 'negative' | 'cognitive'

interface AvatarReact {
  type: 'avatar.react'
  trigger: string
  bus: ReactionBus
  state: string
  intensity: number
  holdMs: number
  returnTo?: string
  anchor?: string
}

export type AgentCommand =
  | { type: 'open_app'; id: string }
  | { type: 'close_app'; id: string }
  | { type: 'move_window'; id: string; x: number; y: number }
  | { type: 'arrange'; layout: string; apps?: string[] }
  | { type: 'sequence'; steps: AgentCommand[] }
  | { type: 'ui_action'; action: string; args?: Record<string, unknown> }
  | AvatarReact

/** Every server frame has a string `type`; everything else is read defensively. */
export interface ServerFrame {
  type: string
  [key: string]: unknown
}

interface EventFrame extends ServerFrame {
  type: 'event'
  event: string
  data: Record<string, unknown> & { type?: string }
}

export type ClientMessage = { type: string } & Record<string, unknown>

/** A reminder that has actually arrived (not one scheduled for later). */
export const delivered = (n: Pick<Notification, 'sent_at' | 'scheduled_for'>, now = Date.now()): boolean =>
  !!n.sent_at || !n.scheduled_for || Date.parse(n.scheduled_for) <= now

/** How long a reminder that just went off keeps "ringing" (its card glows) unless it's acknowledged. */
export const RING_MS = 15 * 60_000

/** A reminder that has just gone off and nobody has said "Got it" to yet: an alarm, right now. */
export const ringing = (
  n: Pick<Notification, 'sent_at' | 'scheduled_for' | 'read_at' | 'created_at'>,
  now = Date.now(),
): boolean => {
  if (n.read_at || !delivered(n, now)) return false
  const at = Date.parse(n.sent_at ?? n.scheduled_for ?? n.created_at)
  return Number.isFinite(at) && now - at < RING_MS
}

export function isEventFrame(f: ServerFrame): f is EventFrame {
  return f.type === 'event' && typeof f.event === 'string' && !!f.data && typeof f.data === 'object'
}

/** Recurring events are expanded server-side and share an `id`; key each occurrence separately. */
export function occurrenceKey(e: CalendarOccurrence): string {
  return e.occurrence_start ? `${e.id}@${e.occurrence_start}` : e.id
}

/** Error codes that belong to a chat turn rather than a request/response pair. */
export const CHAT_ERROR_CODES = new Set(['llm_failed', 'conversation_failed'])
