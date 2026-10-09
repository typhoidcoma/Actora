import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAgent } from '../stores/agent'
import { ui, useUi } from '../stores/ui'
import { startAutoReader } from './autoReader'

const talk = (text: string) =>
  useAgent.setState({ turnId: 'c1', awaitingTurn: false, streaming: text, phase: 'speaking' })

describe('following Wendy while she talks', () => {
  let stop: () => void
  beforeEach(() => {
    ui.closeAll()
    useAgent.setState({ turnId: null, awaitingTurn: false, streaming: null, phase: 'idle' })
    stop = startAutoReader()
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
})
