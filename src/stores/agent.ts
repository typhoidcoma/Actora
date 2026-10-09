import { create } from 'zustand'
import type { EmotionVector, MoodState, ReactionBus } from '../aelora/protocol'
import type { SocketStatus } from '../aelora/socket'

export type OrbPhase = 'offline' | 'idle' | 'thinking' | 'speaking' | 'tool'

export interface ChatBubble {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
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
export interface Notice {
  notificationId: string
  title: string
  body: string | null
}

/**
 * What the Wendy line (her voice above the grid) is showing:
 * the welcome greeting, her latest reply, a notification, or a one-off message.
 */
export type LineMode = 'greeting' | 'reply' | 'notice' | 'message'

export interface AgentState {
  connection: SocketStatus
  phase: OrbPhase
  toolName: string | null
  botName: string
  email: string | null
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
  messages: ChatBubble[]

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
  userName: null,
  mood: null,
  emotion: {},
  reaction: null,
  conversationId: null,
  turnId: null,
  awaitingTurn: false,
  streaming: null,
  messages: [],
  greeting: { text: '', streaming: false },
  greetingPending: false,
  line: 'greeting',
  notice: null,
  message: null,
}))

export const agent = {
  showGreeting: () => useAgent.setState({ line: 'greeting', notice: null, message: null }),
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
