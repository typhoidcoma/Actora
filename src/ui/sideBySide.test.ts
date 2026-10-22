import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runUiAction } from '../aelora/router'
import { useAgent } from '../stores/agent'
import { phone } from '../stores/phone'
import { panelKeyOf, sideBySide, ui, useUi } from '../stores/ui'
import { startAutoChat } from './autoChat'
import { peeking, stopPeek } from './peek'

const wide = (on: boolean) => {
  phone.split = () => on
}
const talk = (text: string) =>
  useAgent.setState({ turnId: 'c1', awaitingTurn: false, streaming: text, phase: 'speaking' })

beforeEach(() => {
  wide(false)
  ui.closeAll()
  useAgent.setState({ turnId: null, awaitingTurn: false, streaming: null, phase: 'idle', messages: [] })
})
afterEach(() => {
  stopPeek()
  wide(false)
  vi.unstubAllGlobals()
})

describe('her chat and another window, side by side on a wide screen', () => {
  it('opening a window keeps the chat up beside it', () => {
    wide(true)
    ui.openChat()
    ui.focus('tasks')
    expect(useUi.getState()).toMatchObject({ chatOpen: true, focus: 'tasks' })
    expect(sideBySide(useUi.getState())).toBe(true)
    // The window beside the chat keeps its own pills.
    expect(panelKeyOf(useUi.getState())).toBe('tile:tasks')
  })

  it('opening the chat keeps the window that is up', () => {
    wide(true)
    ui.openVault()
    ui.openChat()
    expect(useUi.getState()).toMatchObject({ chatOpen: true, vault: true })
  })

  it('still one other window at a time', () => {
    wide(true)
    ui.openChat()
    ui.focus('tasks')
    ui.openVault()
    expect(useUi.getState()).toMatchObject({ chatOpen: true, vault: true, focus: null })
  })

  it('closing either one leaves the other', () => {
    wide(true)
    ui.openChat()
    ui.focus('calendar')
    ui.focus(null)
    expect(useUi.getState()).toMatchObject({ chatOpen: true, focus: null })
    ui.focus('calendar')
    ui.closeChat()
    expect(useUi.getState()).toMatchObject({ chatOpen: false, focus: 'calendar' })
  })

  it('narrow screens keep one window at a time', () => {
    ui.openChat()
    ui.focus('tasks')
    expect(useUi.getState()).toMatchObject({ chatOpen: false, focus: 'tasks' })
    ui.openChat()
    expect(useUi.getState()).toMatchObject({ chatOpen: true, focus: null })
  })
})

describe('her moves while you talk, on a wide screen', () => {
  it('what she opens sits beside the chat, not as a glance', () => {
    wide(true)
    ui.openChat()
    runUiAction('list.open', { tile: 'goals' })
    expect(peeking()).toBe(false)
    expect(useUi.getState()).toMatchObject({ chatOpen: true, focus: 'goals' })
  })

  it('going home closes only the window beside the chat', () => {
    wide(true)
    ui.openChat()
    runUiAction('vault.open', {})
    runUiAction('home.show', {})
    expect(useUi.getState()).toMatchObject({ chatOpen: true, vault: false })
  })

  it('on a narrow screen it is still a glance', () => {
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })
    ui.openChat()
    runUiAction('list.open', { tile: 'goals' })
    expect(peeking()).toBe(true)
    expect(useUi.getState()).toMatchObject({ chatOpen: false, focus: 'goals' })
  })
})

describe('the chat follows her words beside her window', () => {
  let stop: () => void
  beforeEach(() => {
    useUi.setState({ lineOverflow: false })
    stop = startAutoChat()
  })
  afterEach(() => stop())

  it('a card she opened herself mid-turn stays, and the chat opens beside it', () => {
    wide(true)
    talk('Look at this ')
    ui.open({ kind: 'event', id: 'e1' }) // her card.open
    talk('Look at this one, it starts soon.')
    expect(useUi.getState()).toMatchObject({ chatOpen: true, selected: { kind: 'event', id: 'e1' } })
  })

  it('never over People', () => {
    wide(true)
    ui.openPeople()
    talk('Hey, a quick thing ')
    expect(useUi.getState()).toMatchObject({ chatOpen: false, people: true })
  })
})

describe('her words for the lists', () => {
  it('opens the list whatever she calls it, and says why when she asks for one that is not there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    for (const [said, tile] of [
      [{ tile: 'Calendar' }, 'calendar'],
      [{ tile: 'events' }, 'calendar'],
      [{ list: 'schedule' }, 'calendar'],
      [{ tile: 'todos' }, 'tasks'],
      [{ kind: 'goal' }, 'goals'],
    ] as const) {
      ui.closeAll()
      runUiAction('list.open', said)
      expect(useUi.getState().focus).toBe(tile)
    }
    ui.closeAll()
    runUiAction('list.open', { tile: 'weather' })
    expect(useUi.getState().focus).toBe(null)
    expect(warn).toHaveBeenCalledWith('[her action] refused', 'list.open', '(no such list)', { tile: 'weather' })
    vi.restoreAllMocks()
  })
})
