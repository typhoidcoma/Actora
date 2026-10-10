import { beforeEach, describe, expect, it } from 'vitest'
import { useAgent } from '../stores/agent'
import { entities, useEntities } from '../stores/entities'
import { sendChat } from './chat'
import { backoffMs, closeAction } from './closePolicy'
import type { ClientMessage, ServerFrame, Task } from './protocol'
import { routeFrame } from './router'
import type { FrameBus } from './socket'

class FakeBus implements FrameBus {
  sent: ClientMessage[] = []
  send(msg: ClientMessage) {
    this.sent.push(msg)
    return true
  }
  subscribe() {
    return () => {}
  }
}

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Write tests',
  status: 'todo',
  goal_id: null,
  vault_id: null,
  due_date: null,
  estimated_minutes: null,
  committed_at: null,
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('close policy', () => {
  it('treats an admin kick as fatal and 1008 as reauth', () => {
    expect(closeAction(4001)).toBe('fatal')
    expect(closeAction(1008)).toBe('reauth')
    expect(closeAction(1013)).toBe('retry-slow')
    expect(closeAction(1006)).toBe('retry')
    expect(closeAction(1011)).toBe('retry')
  })

  it('backs off exponentially with a cap', () => {
    const max = () => 1
    expect(backoffMs(0, false, max)).toBe(500)
    expect(backoffMs(3, false, max)).toBe(4000)
    expect(backoffMs(20, false, max)).toBe(20_000)
    expect(backoffMs(0, true, max)).toBe(4000)
    expect(backoffMs(0, false, () => 0)).toBe(250)
  })
})

describe('entity sync', () => {
  const bus = new FakeBus()
  beforeEach(() => entities.reset())

  it('dedupes a direct reply and its broadcast echo by id', () => {
    const t = task()
    routeFrame({ type: 'task.created', task: t }, bus)
    routeFrame({ type: 'event', event: 'task', data: { type: 'task:created', task: t } }, bus)
    expect(Object.keys(useEntities.getState().tasks)).toEqual(['t1'])
  })

  it('ignores a stale row that arrives after a newer one', () => {
    routeFrame({ type: 'task.updated', task: task({ title: 'new', updated_at: '2026-10-02T00:00:00Z' }) }, bus)
    routeFrame({ type: 'event', event: 'task', data: { type: 'task:updated', task: task({ title: 'old' }) } }, bus)
    expect(useEntities.getState().tasks.t1.title).toBe('new')
  })

  it('applies deletes from broadcasts', () => {
    routeFrame({ type: 'task.list', tasks: [task(), task({ id: 't2' })] }, bus)
    routeFrame({ type: 'event', event: 'task', data: { type: 'task:deleted', id: 't1' } }, bus)
    expect(Object.keys(useEntities.getState().tasks)).toEqual(['t2'])
    expect(useEntities.getState().hydrated.tasks).toBe(true)
  })

  it('keys recurring calendar occurrences separately and removes a whole series', () => {
    const occ = (start: string) => ({
      id: 'e1',
      title: 'Standup',
      start_time: start,
      end_time: start,
      is_recurring: true,
      occurrence_start: start,
    })
    routeFrame({ type: 'calendar.list', events: [occ('2026-10-08T09:00:00Z'), occ('2026-10-09T09:00:00Z')] }, bus)
    expect(Object.keys(useEntities.getState().events)).toHaveLength(2)
    routeFrame({ type: 'event', event: 'calendar', data: { type: 'calendar:deleted', id: 'e1' } }, bus)
    expect(Object.keys(useEntities.getState().events)).toHaveLength(0)
  })
})

describe('chat turn', () => {
  let bus: FakeBus
  const cid = '11111111-1111-1111-1111-111111111111'
  const frame = (f: ServerFrame) => routeFrame(f, bus)

  beforeEach(() => {
    bus = new FakeBus()
    useAgent.setState({
      connection: 'open',
      phase: 'idle',
      messages: [],
      streaming: null,
      turnId: null,
      awaitingTurn: false,
      conversationId: cid,
    })
  })

  it('streams tokens and replaces them with the authoritative done.text', () => {
    expect(sendChat(bus, 'hi')).toBe(true)
    expect(bus.sent[0]).toEqual({ type: 'chat', message: 'hi', conversationId: cid })
    frame({ type: 'chat.start', conversationId: cid })
    frame({ type: 'token', conversationId: cid, delta: 'Hel' })
    frame({ type: 'token', conversationId: cid, delta: 'lo' })
    expect(useAgent.getState().streaming).toBe('Hello')
    expect(useAgent.getState().phase).toBe('speaking')
    frame({ type: 'done', conversationId: cid, text: 'Hello there' })
    const s = useAgent.getState()
    expect(s.streaming).toBeNull()
    expect(s.phase).toBe('idle')
    expect(s.messages.map((m) => m.text)).toEqual(['hi', 'Hello there'])
  })

  it('clears streamed text when the model pivots to a tool', () => {
    sendChat(bus, 'plan my day')
    frame({ type: 'chat.start', conversationId: cid })
    frame({ type: 'token', conversationId: cid, delta: 'Let me just' })
    frame({
      type: 'event',
      event: 'mindmap',
      data: { type: 'tool:working', conversationId: cid, names: ['list_tasks'] },
    })
    expect(useAgent.getState().streaming).toBe('')
    frame({ type: 'tool.progress', conversationId: cid, phase: 'called', name: 'list_tasks' })
    expect(useAgent.getState().phase).toBe('tool')
    expect(useAgent.getState().toolName).toBe('list_tasks')
  })

  it('ignores system_chat frames, which carry only channelId', () => {
    sendChat(bus, 'hi')
    frame({ type: 'chat.start', conversationId: cid })
    frame({ type: 'token', channelId: 'system:u1', delta: 'SYSTEM' })
    frame({ type: 'done', channelId: 'system:u1', text: 'SYSTEM' })
    expect(useAgent.getState().streaming).toBe('')
    expect(useAgent.getState().turnId).toBe(cid)
  })

  it('her welcome joins the chat, and she knows it when the user answers it', async () => {
    const { sendGreeting, greetingInContext, loadTranscript } = await import('./chat')
    const { sendClientState } = await import('./router')
    loadTranscript([{ seq: 1, role: 'assistant', content: 'Yesterday’s answer.' }] as never)
    expect(sendGreeting(bus, 'APP EVENT: welcome')).toBe(true)
    frame({ type: 'chat.start', channelId: 'system:u1' })
    frame({ type: 'done', channelId: 'system:u1', text: 'Morning! Want a quick plan?' })
    expect(useAgent.getState().messages.map((m) => m.text)).toEqual([
      'Yesterday’s answer.',
      'Morning! Want a quick plan?',
    ])
    // A fresh read of the thread (reconnect) keeps it: the server never had it.
    loadTranscript([{ seq: 1, role: 'assistant', content: 'Yesterday’s answer.' }] as never)
    expect(useAgent.getState().messages.at(-1)?.greeting).toBe(true)
    // The user answers: the screen snapshot carries what she asked.
    sendChat(bus, 'Yes please')
    sendClientState(bus)
    const state = bus.sent.at(-1) as unknown as { ui: { screen: { yourGreeting?: string } } }
    expect(state.ui.screen.yourGreeting).toBe('Morning! Want a quick plan?')
    // Once she has replied, it's ordinary history and drops out.
    frame({ type: 'chat.start', conversationId: cid })
    frame({ type: 'done', conversationId: cid, text: 'Here it is.' })
    expect(greetingInContext()).toBeNull()
  })

  it('a newer welcome replaces an unanswered one', async () => {
    const { sendGreeting } = await import('./chat')
    for (const text of ['Hi one.', 'Hi two.']) {
      sendGreeting(bus, 'APP EVENT: welcome')
      frame({ type: 'done', channelId: 'system:u1', text })
    }
    expect(useAgent.getState().messages.map((m) => m.text)).toEqual(['Hi two.'])
  })

  it('message.react puts one emoji on the user message: her "got it"', async () => {
    const { reactToMessage } = await import('./chat')
    const { runUiAction } = await import('./router')
    sendChat(bus, 'I finished the deck')
    frame({ type: 'chat.start', conversationId: cid })
    runUiAction('message.react', { emoji: '🎉' })
    expect(useAgent.getState().messages.at(-1)).toMatchObject({ role: 'user', react: '🎉' })
    frame({ type: 'done', conversationId: cid, text: 'Nice work.' })
    // Her reply carries none; the user's message keeps it.
    expect(useAgent.getState().messages.at(-1)?.react).toBeUndefined()
    expect(useAgent.getState().messages.at(-2)?.react).toBe('🎉')
    // The old name still works.
    runUiAction('reply.react', { emoji: '👍🏽' })
    expect(useAgent.getState().messages.at(-2)?.react).toBe('👍🏽')
    // Only a single emoji; words, two emoji or junk are ignored.
    for (const bad of ['yay', '🎉🎉', '', 42, '<b>', '❤️ ok']) expect(reactToMessage(bad)).toBe(false)
    expect(reactToMessage('❤️')).toBe(true)
    expect(reactToMessage('👩‍💻')).toBe(true)
  })

  it('refuses a second chat while one is in flight', () => {
    expect(sendChat(bus, 'one')).toBe(true)
    expect(sendChat(bus, 'two')).toBe(false)
  })

  it('closes out the turn on llm_failed', () => {
    sendChat(bus, 'hi')
    frame({ type: 'chat.start', conversationId: cid })
    frame({ type: 'error', code: 'llm_failed', conversationId: cid, message: 'llm error' })
    const s = useAgent.getState()
    expect(s.turnId).toBeNull()
    expect(s.messages.at(-1)?.role).toBe('error')
  })
})
