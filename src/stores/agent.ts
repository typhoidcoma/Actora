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

export interface AgentState {
  connection: SocketStatus
  phase: OrbPhase
  toolName: string | null
  botName: string
  email: string | null
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
}

export const useAgent = create<AgentState>(() => ({
  connection: 'idle',
  phase: 'offline',
  toolName: null,
  botName: 'Wendy',
  email: null,
  mood: null,
  emotion: {},
  reaction: null,
  conversationId: null,
  turnId: null,
  awaitingTurn: false,
  streaming: null,
  messages: [],
}))

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
