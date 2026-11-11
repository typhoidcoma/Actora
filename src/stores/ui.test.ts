import { beforeEach, describe, expect, it } from 'vitest'
import { ui, useUi } from './ui'

describe('Escape closes the top layer only', () => {
  beforeEach(() => ui.closeAll())

  it('a sheet, then the panel, then the chat: one press each', () => {
    // A wide screen's chat beside a panel, with the typing sheet over both.
    useUi.setState({ chatOpen: true, focus: 'tasks', keyboardOpen: true })
    ui.closeTop()
    expect(useUi.getState()).toMatchObject({ keyboardOpen: false, focus: 'tasks', chatOpen: true })
    ui.closeTop()
    expect(useUi.getState()).toMatchObject({ focus: null, chatOpen: true })
    ui.closeTop()
    expect(useUi.getState().chatOpen).toBe(false)
  })

  it('Past chats and a day picker close on their own first', () => {
    useUi.setState({ chatOpen: true, pastChats: true, picking: 't1' })
    ui.closeTop()
    expect(useUi.getState()).toMatchObject({ picking: null, pastChats: true, chatOpen: true })
    ui.closeTop()
    expect(useUi.getState()).toMatchObject({ pastChats: false, chatOpen: true })
  })
})
