import { orbSignals, useAgent, type ChatBubble } from '../stores/agent'
import type { MoodState, ServerFrame, TranscriptMessage } from './protocol'
import type { FrameBus } from './socket'
import { describeTool, describeUiAction, toolDetail, uiActionName } from './activity'
import { sayLinks, scrubToolLeaks, textOptions } from './scrub'
import { strayAction } from './actions'
import { connectGoogle, isGoogleError } from '../google/google'
import { toast } from '../stores/toast'
import { sayOption } from '../options/types'
import { optionsStore } from '../stores/options'
import { contextKeyOf, useUi } from '../stores/ui'
import { isFindsThread } from '../finds/finds'
import { rememberMain } from './mainThread'
import type { Step } from '../stores/agent'

let stepSeq = 0

/** A tool call began; or, if it's already showing (tool.progress and mindmap both report it), fill in its detail. */
/** Tools that are Wendy's own housekeeping (avatar beats, reading app state), not work for the user. */
const BACKSTAGE = new Set(['perform_reaction', 'get_app_state'])

function startStep(steps: Step[], name: string, detail: string | null): Step[] {
  if (BACKSTAGE.has(name)) return steps
  const open = steps.findLastIndex((x) => x.name === name && x.status === 'running')
  if (open >= 0) {
    if (!detail || steps[open].detail) return steps
    return steps.map((x, i) => (i === open ? { ...x, detail } : x))
  }
  return [...steps, { id: `step-${++stepSeq}`, name, ...describeTool(name), detail, status: 'running' }]
}

/**
 * A tool call as a step. Screen actions (ui_action, or one called by name like
 * colors_set) show only when they're worth naming, in their own words.
 */
function startTool(steps: Step[], rawName: string, argsSummary: unknown): Step[] {
  const stray = strayAction(rawName)
  if (!stray && rawName !== 'ui_action') return startStep(steps, rawName, toolDetail(argsSummary))
  const words = describeUiAction(stray ?? uiActionName(argsSummary))
  if (!words || steps.some((x) => x.name === 'ui_action' && x.status === 'running')) return steps
  return [...steps, { id: `step-${++stepSeq}`, name: 'ui_action', ...words, detail: null, status: 'running' }]
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
// What the server actually streamed; the store holds it scrubbed of leaked tool
// calls (a call can arrive split across tokens, so scrub the whole, not each).
let rawReply = ''
let rawGreeting = ''
/** A message waiting for its new thread (sendChat with no main thread yet). */
let pendingMessage: string | null = null
let pendingBus: FrameBus | null = null
let seq = 0
let turnTimer: ReturnType<typeof setTimeout> | undefined

const GREETING_TIMEOUT_MS = 45_000
let greetingTimer: ReturnType<typeof setTimeout> | undefined
const isSystem = (f: ServerFrame) =>
  typeof f.conversationId !== 'string' && typeof f.channelId === 'string' && f.channelId.startsWith('system:')

/** Answers Wendy wrote as say: links go on the pills, as if she'd called options.set. */
function offerSayLinks(raw: string) {
  // Answer links, or an options.set she wrote out instead of calling.
  const links = [...sayLinks(raw), ...textOptions(raw)]
  if (!links.length) return
  optionsStore.push(
    contextKeyOf(useUi.getState()),
    links.slice(0, 5).map((l) => sayOption(l.label, l.say.slice(0, 160), 'pushed')),
  )
}

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
    pendingReact: null,
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
      rawGreeting = ''
      set({ greeting: { text: '', streaming: true } })
      return true
    case 'token':
      rawGreeting += String(f.delta ?? '')
      set({ greeting: { text: scrubToolLeaks(rawGreeting, true), streaming: true } })
      if (s.line === 'greeting' && !s.turnId) set({ phase: 'speaking' })
      orbSignals.bump(0.12)
      return true
    case 'done': {
      clearTimeout(greetingTimer)
      const raw = String(f.text ?? rawGreeting)
      const text = scrubToolLeaks(raw)
      offerSayLinks(raw)
      set({
        greeting: { text, streaming: false },
        greetingPending: false,
        // Into the chat too, so answering it there reads as one conversation
        // (an earlier, unanswered welcome gives way to the new one).
        ...(text
          ? {
              messages: [
                ...get().messages.filter((m) => !m.greeting),
                { id: bubbleId(), role: 'assistant' as const, text, greeting: true as const },
              ],
            }
          : {}),
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
      // Only a thread we asked for (a message waiting for one), or our first.
      if (!pendingMessage && s.conversationId) return true
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
      rawReply = ''
      set({ turnId: cid, conversationId: cid, awaitingTurn: false, streaming: '' })
      return true

    case 'token':
      if (!mine) return true
      rawReply += String(f.delta ?? '')
      set({ streaming: scrubToolLeaks(rawReply, true), phase: 'speaking', toolName: null })
      orbSignals.bump()
      return true

    case 'tool.progress': {
      if (!mine) return true
      // A ui_action called by name (colors_set) runs here even though the server
      // refuses it (router.ts), so it reads as screen work, not a failure.
      const stray = strayAction(f.name) !== null
      const name = stray ? 'ui_action' : String(f.name ?? '')
      if (f.phase === 'called') {
        set({ phase: 'tool', toolName: name, steps: startTool(s.steps, String(f.name ?? ''), f.argsSummary) })
      } else {
        set({ phase: 'thinking', toolName: null, steps: endStep(s.steps, name, f.phase === 'failed' && !stray) })
        // Failed for want of Google (email, invites): offer to connect it right there.
        if (f.phase === 'failed' && isGoogleError(`${String(f.error ?? '')} ${String(f.result ?? '')}`)) {
          toast.error('Wendy needs your Google account for that.', {
            action: { label: 'Connect', run: () => void connectGoogle() },
            ms: 9000,
          })
        }
        orbSignals.bump(0.45) // a small flare as each step lands
      }
      return true
    }

    case 'done': {
      if (!mine) return true
      clearTimeout(turnTimer)
      const raw = String(f.text ?? rawReply)
      const bubble: ChatBubble = {
        id: bubbleId(),
        role: 'assistant',
        text: scrubToolLeaks(raw),
        ...(s.pendingReact ? { react: s.pendingReact } : {}),
      }
      offerSayLinks(raw)
      // A call that got past the scrubber: log the raw form so the pattern can be fixed.
      if (/[a-z]+_[a-z_]+\W{0,3}[({]/i.test(bubble.text)) console.warn('[scrub] leak survived:', JSON.stringify(raw))
      set({
        messages: [...s.messages, bubble],
        streaming: null,
        turnId: null,
        pendingReact: null,
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
      // No thread named: it's ours only if we just sent a message and nothing has
      // streamed yet. Otherwise it's some other conversation.* call failing (a
      // finds rename, a Past chats list), and this turn carries on.
      if (!cid && !s.awaitingTurn) return true
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
        // (Screen actions get no detail line; their own words say it.)
        if (detail && d.name && d.name !== 'ui_action' && !strayAction(d.name)) {
          set({ steps: startStep(get().steps, d.name, detail) })
        }
        return true
      }
      // After a turn she quietly remembers things about the user: say so, with an Undo.
      if (f.event === 'mindmap' && data?.type === 'fact:extracted' && data.conversationId === s.conversationId) {
        const facts = (data as { facts?: unknown }).facts
        const fact = Array.isArray(facts) && typeof facts[0] === 'string' ? facts[0].trim() : ''
        if (fact) {
          const more = (facts as unknown[]).length - 1
          toast.show(`Noted: ${fact.length > 90 ? `${fact.slice(0, 88)}…` : fact}${more > 0 ? ` (+${more})` : ''}`, {
            ms: 7000,
            undo: () => void import('./client').then((m) => m.forgetByText(fact)),
          })
        }
        return true
      }
      if (f.event === 'mindmap' && data?.type === 'tool:working' && data.conversationId === s.turnId) {
        rawReply = ''
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
    .map((m) => ({
      id: `m${m.seq}`,
      seq: m.seq,
      role: m.role as 'user' | 'assistant',
      text: m.role === 'assistant' ? scrubToolLeaks(m.content) : m.content,
    }))
  const history = { hasMore: !!page.hasMore, cursor: page.nextBeforeSeq ?? null }
  const s = get()
  const held = new Set(s.messages.map((b) => b.seq).filter((x): x is number => x !== undefined))
  const newestHeld = Math.max(-1, ...held)
  // An older page we already hold every message of (a repeated "Load earlier"): nothing to do.
  if (bubbles.length && bubbles.every((b) => held.has(b.seq ?? -1)) && (bubbles.at(-1)?.seq ?? 0) < newestHeld) return
  const oldestHeld = s.messages.find((b) => b.seq !== undefined)?.seq
  const firstNew = messages[0]?.seq
  if (oldestHeld !== undefined && firstNew !== undefined && firstNew < oldestHeld) {
    set({ messages: [...bubbles.filter((b) => (b.seq ?? 0) < oldestHeld), ...s.messages], history })
  } else {
    // A fresh read of the thread: her welcome isn't in it (system_chat), so it
    // stays at the end when nothing has been said since.
    const tail = s.messages.at(-1)
    set({ messages: tail?.greeting ? [...bubbles, tail] : bubbles, history })
  }
}

/**
 * Her welcome, while it's the last thing she said: it isn't in the server's
 * history, so it rides along in the screen snapshot and her reply to "yes"
 * knows what was asked.
 */
export function greetingInContext(): string | null {
  const m = get().messages
  const i = m.findLastIndex((b) => b.greeting)
  if (i < 0 || m.slice(i + 1).some((b) => b.role === 'assistant')) return null
  return m[i].text
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

/** One emoji (with its skin tone, variation or ZWJ sequence), nothing else. */
const ONE_EMOJI = /^\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|⃣|‍\p{Extended_Pictographic}️?)*$/u

/**
 * reply.react: Wendy puts an emoji on her reply to acknowledge something, at her
 * own discretion. Mid-turn it waits for the reply; otherwise it goes on her
 * latest one. Anything that isn't a single emoji is ignored.
 */
export function reactToReply(emoji: unknown): boolean {
  const e = typeof emoji === 'string' ? emoji.trim() : ''
  if (!e || e.length > 16 || !ONE_EMOJI.test(e)) return false
  const s = get()
  if (s.turnId || s.awaitingTurn) {
    set({ pendingReact: e })
    return true
  }
  const i = s.messages.findLastIndex((m) => m.role === 'assistant')
  if (i < 0) return false
  set({ messages: s.messages.map((m, j) => (j === i ? { ...m, react: e } : m)) })
  return true
}
