import { create } from 'zustand'
import type { EmotionVector, MoodState, ReactionBus } from '../aelora/protocol'
import type { SocketStatus } from '../aelora/socket'
import type { StepIcon } from '../aelora/activity'

type OrbPhase = 'offline' | 'idle' | 'thinking' | 'speaking' | 'tool'

export interface ChatBubble {
  id: string
  /** Server sequence number, for paging (absent on bubbles created locally). */
  seq?: number
  role: 'user' | 'assistant' | 'error'
  text: string
  /**
   * Her welcome line, shown in the chat where she said it. It was written over
   * system_chat, so the server's history doesn't have it (see greetingInContext).
   */
  greeting?: true
  /** An emoji Wendy put on the user's message (message.react): her "got it" at a glance. */
  react?: string
}

export interface Reaction {
  bus: ReactionBus
  state: string
  intensity: number
  holdMs: number
  /** performance.now() when it fired; the orb plays it once. */
  at: number
}

/** A proactive notification Wendy is "saying" in the line. */
interface Notice {
  notificationId: string
  title: string
  body: string | null
}

/**
 * What the Wendy line (her voice above the grid) is showing:
 * the welcome greeting, her latest reply, a notification, or a one-off message.
 */
/** One thing Wendy did during a turn (a tool call), for the activity line. */
export interface Step {
  id: string
  name: string
  doing: string
  done: string
  icon: StepIcon
  detail: string | null
  status: 'running' | 'done' | 'failed'
}

type LineMode = 'greeting' | 'reply' | 'notice' | 'message'

export interface AgentState {
  connection: SocketStatus
  phase: OrbPhase
  toolName: string | null
  botName: string
  email: string | null
  /** Supabase user id from hello; scopes per-user caches on shared devices. */
  userId: string | null
  /** Admin accounts also receive other users' events from the server (owner.ts filters them). */
  isAdmin: boolean
  /** First name from the sign-in profile, for greetings. */
  userName: string | null
  mood: MoodState | null
  emotion: EmotionVector
  reaction: Reaction | null

  /** Thread this socket resumed or created. */
  conversationId: string | null
  /** Conversation id of the turn currently streaming (null between turns). */
  turnId: string | null
  /** A `chat` was sent and its `chat.start` hasn't arrived yet. */
  awaitingTurn: boolean
  streaming: string | null
  /** What she's done this turn, newest last (reset when a turn starts). */
  steps: Step[]
  /** Date.now() when the current turn was sent. */
  turnAt: number | null
  messages: ChatBubble[]
  /** Paging backwards through the thread (conversation.open beforeSeq). */
  history: { hasMore: boolean; cursor: number | null }

  /** Welcome line, streamed over system_chat. */
  greeting: { text: string; streaming: boolean }
  /** A system_chat was sent and is not finished. */
  greetingPending: boolean
  line: LineMode
  notice: Notice | null
  /** Free text for line mode 'message' (e.g. push test results, install steps). */
  message: string | null
}

export const useAgent = create<AgentState>(() => ({
  connection: 'idle',
  phase: 'offline',
  toolName: null,
  botName: 'Wendy',
  email: null,
  userId: null,
  isAdmin: false,
  userName: null,
  mood: null,
  emotion: {},
  reaction: null,
  conversationId: null,
  turnId: null,
  awaitingTurn: false,
  steps: [],
  turnAt: null,
  streaming: null,
  messages: [],
  history: { hasMore: false, cursor: null },
  greeting: { text: '', streaming: false },
  greetingPending: false,
  line: 'greeting',
  notice: null,
  message: null,
}))

export const agent = {
  showGreeting: () => useAgent.setState({ line: 'greeting', notice: null, message: null }),
  /** Another account (or signed out): nothing of the last person's conversation stays on screen or in prompts. */
  resetForUser: () =>
    useAgent.setState({
      conversationId: null,
      turnId: null,
      awaitingTurn: false,
      steps: [],
      turnAt: null,
      streaming: null,
      messages: [],
      history: { hasMore: false, cursor: null },
      greeting: { text: '', streaming: false },
      greetingPending: false,
      line: 'greeting',
      notice: null,
      message: null,
      mood: null,
      emotion: {},
      reaction: null,
      toolName: null,
    }),
  showReply: () => useAgent.setState({ line: 'reply' }),
  showNotice: (notice: Notice) => useAgent.setState({ line: 'notice', notice }),
  showMessage: (message: string) => useAgent.setState({ line: 'message', message }),
  react: (bus: ReactionBus, intensity: number, holdMs = 1400) =>
    useAgent.setState({ reaction: { bus, state: 'idle', intensity, holdMs, at: performance.now() } }),
}

/**
 * High-frequency values the orb shader reads every frame. Kept outside React
 * so streaming tokens never trigger re-renders.
 */
export const orbSignals = {
  /** 0..1, bumped by each token and decayed by the render loop. */
  energy: 0,
  bump(amount = 0.18) {
    this.energy = Math.min(1, this.energy + amount)
  },
}
