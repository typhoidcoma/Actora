import { orbSignals, useAgent, type ChatBubble } from '../stores/agent'
import type { MoodState, ServerFrame, TranscriptMessage } from './protocol'
import type { FrameBus } from './socket'
import { describeTool, toolDetail } from './activity'
import { isFindsThread } from '../finds/finds'
import { rememberMain } from './mainThread'
import type { Step } from '../stores/agent'

let stepSeq = 0

/** A tool call began; or, if it's already showing (tool.progress and mindmap both report it), fill in its detail. */
function startStep(steps: Step[], name: string, detail: string | null): Step[] {
  const open = steps.findLastIndex((x) => x.name === name && x.status === 'running')
  if (open >= 0) {
    if (!detail || steps[open].detail) return steps
    return steps.map((x, i) => (i === open ? { ...x, detail } : x))
  }
  return [...steps, { id: `step-${++stepSeq}`, name, ...describeTool(name), detail, status: 'running' }]
}

function endStep(steps: Step[], name: string, failed: boolean): Step[] {
  const open = steps.findLastIndex((x) => x.name === name && x.status === 'running')
  return open < 0 ? steps : steps.map((x, i) => (i === open ? { ...x, status: failed ? 'failed' : 'done' } : x))
}

// The chat turn as a small state machine over the shared frame stream
// (FRONTEND.md → "Streaming chat"):
//   chat → [conversation.created] → chat.start → token* / tool.progress* → done | error
// Frames are matched to the turn by conversationId, so a concurrent system_chat
// (which carries only channelId) never leaks into the bubble.
//
// system_chat is used for Wendy's welcome line: same stream shape, but its
// frames carry only channelId "system:<userId>" and no conversationId.

const TURN_TIMEOUT_MS = 120_000 // the server has no turn timeout of its own
/** A message waiting for its new thread (sendChat with no main thread yet). */
let pendingMessage: string | null = null
let pendingBus: FrameBus | null = null
let seq = 0
let turnTimer: ReturnType<typeof setTimeout> | undefined

const GREETING_TIMEOUT_MS = 45_000
let greetingTimer: ReturnType<typeof setTimeout> | undefined
const isSystem = (f: ServerFrame) =>
  typeof f.conversationId !== 'string' && typeof f.channelId === 'string' && f.channelId.startsWith('system:')

const bubbleId = () => `b${Date.now().toString(36)}${(++seq).toString(36)}`
const set = useAgent.setState
const get = useAgent.getState

export function sendChat(bus: FrameBus, text: string): boolean {
  const message = text.trim()
  const s = get()
  if (!message || s.awaitingTurn || s.turnId) return false

  // Always address the user's own thread. Without an id the server would use its
  // most recent thread, which after a finds hunt is the "Fun finds" one: the reply
  // would be swallowed there and the turn would time out. No thread yet? Make one
  // first and send the message once it exists.
  const target = s.conversationId && !isFindsThread(s.conversationId) ? s.conversationId : null
  const sent = target
    ? bus.send({ type: 'chat', message, conversationId: target })
    : bus.send({ type: 'conversation.new' })
  if (!sent) return false
  if (!target) {
    pendingMessage = message
    pendingBus = bus
  }

  set({
    messages: [...s.messages, { id: bubbleId(), role: 'user', text: message }],
    awaitingTurn: true,
    streaming: '',
    phase: 'thinking',
    toolName: null,
    steps: [],
    turnAt: Date.now(),
  })
  clearTimeout(turnTimer)
  turnTimer = setTimeout(() => failTurn(), TURN_TIMEOUT_MS)
  return true
}

/**
 * Ask Wendy for a welcome line over system_chat (no history, mood or fact
 * side effects). The directive is an app event, never a user turn.
 */
export function sendGreeting(bus: FrameBus, directive: string, onDone?: (text: string) => void): boolean {
  const s = get()
  if (s.greetingPending || s.turnId || s.awaitingTurn) return false
  if (!bus.send({ type: 'system_chat', message: directive })) return false
  greetingDone = onDone
  // A fresh line every time: the old one clears and the orb thinks until her words stream in.
  set({
    greetingPending: true,
    greeting: { text: '', streaming: true },
    ...(s.phase === 'idle' ? { phase: 'thinking' as const } : {}),
  })
  clearTimeout(greetingTimer)
  greetingTimer = setTimeout(() => {
    const g = get()
    set({
      greetingPending: false,
      greeting: { ...g.greeting, streaming: false },
      ...(g.phase === 'thinking' && !g.turnId && !g.awaitingTurn ? { phase: 'idle' as const } : {}),
    })
  }, GREETING_TIMEOUT_MS)
  return true
}
let greetingDone: ((text: string) => void) | undefined

function handleSystemFrame(f: ServerFrame): boolean {
  const s = get()
  if (!s.greetingPending) return true
  switch (f.type) {
    case 'chat.start':
      set({ greeting: { text: '', streaming: true } })
      return true
    case 'token':
      set({ greeting: { text: s.greeting.text + String(f.delta ?? ''), streaming: true } })
      if (s.line === 'greeting' && !s.turnId) set({ phase: 'speaking' })
      orbSignals.bump(0.12)
      return true
    case 'done': {
      clearTimeout(greetingTimer)
      const text = String(f.text ?? s.greeting.text)
      set({
        greeting: { text, streaming: false },
        greetingPending: false,
        ...(s.turnId || s.awaitingTurn ? {} : { phase: 'idle' as const }),
      })
      greetingDone?.(text)
      greetingDone = undefined
      return true
    }
  }
  return false
}

/** Applies a frame to the chat state. Returns true when the frame was chat-related. */
export function handleChatFrame(f: ServerFrame): boolean {
  if (isSystem(f) && (f.type === 'chat.start' || f.type === 'token' || f.type === 'done')) return handleSystemFrame(f)
  const s = get()
  const cid = typeof f.conversationId === 'string' ? f.conversationId : null
  const mine = cid !== null && cid === s.turnId

  switch (f.type) {
    case 'conversation.created':
      // The finds thread's own creation is claimed before this (finds.ts).
      if (!cid) return true
      set({ conversationId: cid })
      rememberMain(cid)
      if (pendingMessage && pendingBus) {
        // The thread we made for a waiting message: send it there now.
        pendingBus.send({ type: 'chat', message: pendingMessage, conversationId: cid })
        pendingMessage = null
        pendingBus = null
      }
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

    case 'tool.progress': {
      if (!mine) return true
      const name = String(f.name ?? '')
      if (f.phase === 'called') {
        set({ phase: 'tool', toolName: name, steps: startStep(s.steps, name, toolDetail(f.argsSummary)) })
      } else {
        set({ phase: 'thinking', toolName: null, steps: endStep(s.steps, name, f.phase === 'failed') })
        orbSignals.bump(0.45) // a small flare as each step lands
      }
      return true
    }

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
      // The thread is gone: start a fresh one next time instead of failing again.
      if (code === 'conversation_failed') {
        rememberMain(null)
        set({ conversationId: null })
      }
      failTurn()
      return true
    }

    case 'event': {
      const data = f.data as { type?: string; conversationId?: string } | undefined
      // Tokens already streamed were retracted because the model pivoted to a tool.
      // The mindmap copy of a tool call carries its arguments: the query, the page.
      if (f.event === 'mindmap' && data?.type === 'tool:called' && data.conversationId === s.turnId) {
        const d = data as { name?: string; argsSummary?: unknown }
        const detail = toolDetail(d.argsSummary)
        if (detail && d.name) set({ steps: startStep(get().steps, d.name, detail) })
        return true
      }
      if (f.event === 'mindmap' && data?.type === 'tool:working' && data.conversationId === s.turnId) {
        set({ streaming: '', phase: 'tool' })
        return true
      }
      return false
    }
  }
  return false
}

/**
 * A page of conversation.messages (always ascending by seq). Paging goes
 * backwards, so a page older than what we hold is prepended; anything else is
 * a fresh read of the newest messages and replaces the transcript.
 */
export function loadTranscript(
  messages: TranscriptMessage[],
  page: { hasMore?: boolean; nextBeforeSeq?: number | null } = {},
): void {
  const bubbles: ChatBubble[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ id: `m${m.seq}`, seq: m.seq, role: m.role as 'user' | 'assistant', text: m.content }))
  const history = { hasMore: !!page.hasMore, cursor: page.nextBeforeSeq ?? null }
  const s = get()
  const oldestHeld = s.messages.find((b) => b.seq !== undefined)?.seq
  const firstNew = messages[0]?.seq
  if (oldestHeld !== undefined && firstNew !== undefined && firstNew < oldestHeld) {
    set({ messages: [...bubbles.filter((b) => (b.seq ?? 0) < oldestHeld), ...s.messages], history })
  } else {
    set({ messages: bubbles, history })
  }
}

function failTurn(): void {
  clearTimeout(turnTimer)
  pendingMessage = null
  pendingBus = null
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
