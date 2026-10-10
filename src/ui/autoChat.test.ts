import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAgent } from '../stores/agent'
import { ui, useUi } from '../stores/ui'
import { startAutoChat } from './autoChat'

const talk = (text: string) =>
  useAgent.setState({ turnId: 'c1', awaitingTurn: false, streaming: text, phase: 'speaking' })

describe('following Wendy while she talks', () => {
  let stop: () => void
  beforeEach(() => {
    ui.closeAll()
    useAgent.setState({ turnId: null, awaitingTurn: false, streaming: null, phase: 'idle', messages: [] })
    useUi.setState({ lineOverflow: false })
    stop = startAutoChat()
  })
  afterEach(() => stop())

  it('brings up the main chat when she talks inside a task or list', () => {
    ui.open({ kind: 'task', id: 't1' })
    talk('Sure, ')
    expect(useUi.getState()).toMatchObject({ chatOpen: true, selected: null })
  })

  it('leaves a card Wendy opened herself mid-turn', () => {
    ui.openChat()
    talk('Look at this ')
    ui.open({ kind: 'event', id: 'e1' }) // her card.open
    talk('Look at this one, it starts soon.')
    expect(useUi.getState()).toMatchObject({ chatOpen: false, selected: { kind: 'event', id: 'e1' } })
  })

  it('stays closed for the turn once the user closes the chat', () => {
    ui.focus('tasks')
    talk('One ')
    expect(useUi.getState().chatOpen).toBe(true)
    ui.closeChat()
    ui.focus('tasks')
    talk('One more thing')
    expect(useUi.getState().chatOpen).toBe(false)
  })

  it('from home, a long or structured answer opens the chat (there is no separate reader)', () => {
    talk('Here is the plan:\n- one\n- two\n- three')
    expect(useUi.getState().chatOpen).toBe(true)
  })

  it('from home, a short reply stays in her line', () => {
    talk('Done.')
    expect(useUi.getState()).toMatchObject({ chatOpen: false })
  })

  it('from home, a reply past its first sentence (her "Read all") opens the chat', () => {
    talk('Done. I also moved Friday')
    expect(useUi.getState().chatOpen).toBe(true)
  })

  it('from home, a first sentence too long for the line opens the chat', () => {
    talk('A single sentence that runs on')
    expect(useUi.getState().chatOpen).toBe(false)
    useUi.setState({ lineOverflow: true })
    expect(useUi.getState().chatOpen).toBe(true)
  })

  it('once closed, more sentences in the same turn leave it closed', () => {
    talk('Done. I also ')
    ui.closeChat()
    talk('Done. I also moved Friday. And a third thing.')
    expect(useUi.getState().chatOpen).toBe(false)
  })

  it('a whole reply landing as the turn ends opens the chat when it has more', () => {
    useAgent.setState({ awaitingTurn: true, turnAt: 1 })
    useAgent.setState({
      awaitingTurn: false,
      turnAt: null,
      messages: [{ id: 'a1', role: 'assistant', text: 'Sure. Here is the rest of it.' }],
    })
    expect(useUi.getState().chatOpen).toBe(true)
  })

  it('a transcript loading at home, outside a turn, does not open the chat', () => {
    useAgent.setState({ messages: [{ id: 'a1', role: 'assistant', text: 'Old. Reply with more.' }] })
    expect(useUi.getState().chatOpen).toBe(false)
  })
})
