import { orbSignals, useAgent, type ChatBubble } from '../stores/agent'
import type { MoodState, ServerFrame, TranscriptMessage } from './protocol'
import type { FrameBus } from './socket'

// The chat turn as a small state machine over the shared frame stream
// (FRONTEND.md → "Streaming chat"):
//   chat → [conversation.created] → chat.start → token* / tool.progress* → done | error
// Frames are matched to the turn by conversationId, so a concurrent system_chat
// (which carries only channelId) never leaks into the bubble.

const TURN_TIMEOUT_MS = 120_000 // the server has no turn timeout of its own
let seq = 0
let turnTimer: ReturnType<typeof setTimeout> | undefined

const bubbleId = () => `b${Date.now().toString(36)}${(++seq).toString(36)}`
const set = useAgent.setState
const get = useAgent.getState

export function sendChat(bus: FrameBus, text: string): boolean {
  const message = text.trim()
  const s = get()
  if (!message || s.awaitingTurn || s.turnId) return false

  const sent = bus.send({
    type: 'chat',
    message,
    ...(s.conversationId ? { conversationId: s.conversationId } : {}),
  })
  if (!sent) return false

  set({
    messages: [...s.messages, { id: bubbleId(), role: 'user', text: message }],
    awaitingTurn: true,
    streaming: '',
    phase: 'thinking',
    toolName: null,
  })
  clearTimeout(turnTimer)
  turnTimer = setTimeout(() => failTurn(), TURN_TIMEOUT_MS)
  return true
}

/** Applies a frame to the chat state. Returns true when the frame was chat-related. */
export function handleChatFrame(f: ServerFrame): boolean {
  const s = get()
  const cid = typeof f.conversationId === 'string' ? f.conversationId : null
  const mine = cid !== null && cid === s.turnId

  switch (f.type) {
    case 'conversation.created':
      // Either an implicit new thread for our pending turn, or conversation.new.
      if (cid) set({ conversationId: cid })
      return true

    case 'chat.start':
      if (!cid || !s.awaitingTurn) return true // system_chat or another device's turn
      set({ turnId: cid, conversationId: cid, awaitingTurn: false, streaming: '' })
      return true

    case 'token':
      if (!mine) return true
      set({ streaming: (s.streaming ?? '') + String(f.delta ?? ''), phase: 'speaking', toolName: null })
      orbSignals.bump()
      return true

    case 'tool.progress':
      if (!mine) return true
      if (f.phase === 'called') set({ phase: 'tool', toolName: String(f.name ?? '') })
      else set({ phase: 'thinking', toolName: null })
      return true

    case 'done': {
      if (!mine) return true
      clearTimeout(turnTimer)
      const bubble: ChatBubble = { id: bubbleId(), role: 'assistant', text: String(f.text ?? '') }
      set({
        messages: [...s.messages, bubble],
        streaming: null,
        turnId: null,
        phase: 'idle',
        toolName: null,
        ...(f.mood && typeof f.mood === 'object' ? { mood: f.mood as MoodState } : {}),
      })
      return true
    }

    case 'error': {
      const code = String(f.code ?? '')
      if (code !== 'llm_failed' && code !== 'conversation_failed') return false
      if (cid && !mine) return true
      if (!s.turnId && !s.awaitingTurn) return true
      failTurn()
      return true
    }

    case 'event': {
      const data = f.data as { type?: string; conversationId?: string } | undefined
      // Tokens already streamed were retracted because the model pivoted to a tool.
      if (f.event === 'mindmap' && data?.type === 'tool:working' && data.conversationId === s.turnId) {
        set({ streaming: '', phase: 'tool' })
        return true
      }
      return false
    }
  }
  return false
}

export function loadTranscript(messages: TranscriptMessage[]): void {
  const bubbles: ChatBubble[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ id: `m${m.seq}`, role: m.role as 'user' | 'assistant', text: m.content }))
  // Keep a turn that is mid-flight; replace the settled history.
  set({ messages: bubbles })
}

function failTurn(): void {
  clearTimeout(turnTimer)
  const s = get()
  set({
    messages: [...s.messages, { id: bubbleId(), role: 'error', text: `${s.botName} couldn't answer that. Try again.` }],
    streaming: null,
    turnId: null,
    awaitingTurn: false,
    phase: s.connection === 'open' ? 'idle' : 'offline',
    toolName: null,
  })
}

/** Socket dropped mid-turn: in-flight replies are lost, so close out the turn. */
export function abortTurnOnDisconnect(): void {
  const s = get()
  if (s.turnId || s.awaitingTurn) failTurn()
}
