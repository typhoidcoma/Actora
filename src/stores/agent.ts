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
  /** When it was said (ISO), so her welcome knows how long ago the last chat was. */
  at?: string
  /**
   * Her welcome line, shown in the chat where she said it. It was written over
   * system_chat, so the server's history doesn't have it (see greetingInContext).
   */
  greeting?: true
  /** An emoji the agent put on the user's message (message.react): her "got it" at a glance. */
  react?: string
  /** A gift she gave in this reply (its imageId): shown under her words. Not in the server's history. */
  gift?: string
}

export interface Reaction {
  bus: ReactionBus
  state: string
  intensity: number
  holdMs: number
  /** performance.now() when it fired; the orb plays it once. */
  at: number
}

/** A proactive notification the agent is "saying" in the line. */
interface Notice {
  notificationId: string
  title: string
  body: string | null
}

/**
 * What the the agent line (her voice above the grid) is showing:
 * the welcome greeting, her latest reply, a notification, or a one-off message.
 */
/** One thing the agent did during a turn (a tool call), for the activity line. */
/** Her real work this turn (searches, lookups), leaving out screen moves. */
export const workSteps = (steps: Step[]): Step[] => steps.filter((x) => x.name !== 'ui_action')

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
  /** Her welcome, or a check-in (same path, but it stays up until answered). */
  greeting: {
    text: string
    streaming: boolean
    checkin?: boolean
    /** Seen and moved on from (left home after it, or started talking): it doesn't come back on the line. */
    spent?: boolean
  }
  /** A system_chat was sent and is not finished. */
  greetingPending: boolean
  /** The main thread's latest messages have been read (or there is none): her welcome can pick up from them. */
  transcriptReady: boolean
  line: LineMode
  notice: Notice | null
  /** Free text for line mode 'message' (e.g. push test results, install steps). */
  message: string | null
  /** A gift she gave mid-turn, before her reply landed: it goes on that reply. */
  pendingGift: string | null
}

const NAME_KEY = 'actora.agentName.v1'
/** The connected agent's name, as the server last gave it (remembered, so it never flashes a placeholder). */
function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'Assistant'
  } catch {
    return 'Assistant'
  }
}
export function rememberAgentName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    /* private mode */
  }
}
/** The agent's name, for text outside React (toasts, prompts). */
export const agentName = (): string => useAgent.getState().botName

export const useAgent = create<AgentState>(() => ({
  connection: 'idle',
  phase: 'offline',
  toolName: null,
  botName: rememberedName(),
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
  transcriptReady: false,
  line: 'greeting',
  notice: null,
  message: null,
  pendingGift: null,
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
      transcriptReady: false,
      line: 'greeting',
      notice: null,
      message: null,
      mood: null,
      emotion: {},
      reaction: null,
      toolName: null,
      pendingGift: null,
    }),
  /**
   * A gift she just gave: under the reply she's writing now (once it lands),
   * or, with no turn under way, under her last words.
   */
  attachGift(id: string) {
    const s = useAgent.getState()
    if (s.turnId || s.awaitingTurn) return useAgent.setState({ pendingGift: id })
    const i = s.messages.findLastIndex((m) => m.role === 'assistant')
    // Only words she's just said: a gift from nowhere doesn't go on yesterday's reply.
    const at = Date.parse(s.messages[i]?.at ?? '')
    if (i < 0 || s.messages[i].gift || !(Date.now() - at < 120_000)) return
    const messages = [...s.messages]
    messages[i] = { ...messages[i], gift: id }
    useAgent.setState({ messages })
  },
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
