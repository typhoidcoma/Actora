import { beforeEach, describe, expect, it } from 'vitest'
import { describeTool } from '../aelora/activity'
import { isGoogleError } from '../google/google'
import { approvalOptions, pending, usePending, waiting } from './pending'
import { useToast } from './toast'

describe('waiting for the user OK (pending_action)', () => {
  beforeEach(() => pending.clear())

  it('tracks a prepared action through to done', () => {
    pending.apply({ type: 'pending_action:created', id: 'a1', kind: 'send_email', summary: 'To: sam@x.com · Lunch?' })
    const p = waiting(usePending.getState().items)[0]
    expect(p).toMatchObject({ id: 'a1', kind: 'send_email', status: 'waiting' })
    pending.apply({ type: 'pending_action:retryable', id: 'a1' })
    expect(usePending.getState().items.a1.status).toBe('retryable')
    pending.apply({ type: 'pending_action:done', id: 'a1' })
    expect(usePending.getState().items.a1).toBeUndefined()
    expect(useToast.getState().toasts.at(-1)?.text).toBe('Email sent')
  })

  it('answers are user messages that name the action', () => {
    pending.apply({ type: 'pending_action:created', id: 'a2', kind: 'send_invite', summary: 'Standup' })
    const opts = approvalOptions(waiting(usePending.getState().items)[0])
    expect(opts.map((o) => o.label)).toEqual(['Send invite', 'Change it', 'Discard'])
    expect(opts[0].say).toContain('action a2')
    expect(opts[2].say).toContain('Discard')
    expect(opts.every((o) => !o.act)).toBe(true)
  })

  it('drops actions older than a day', () => {
    usePending.setState({
      items: { old: { id: 'old', kind: 'trash', summary: '', status: 'waiting', at: Date.now() - 25 * 3600_000 } },
    })
    expect(waiting(usePending.getState().items)).toHaveLength(0)
  })
})

describe('email work in words', () => {
  it('says what needs the user OK', () => {
    expect(describeTool('draft_email').doing).toBe('Drafting an email for your OK')
    expect(describeTool('propose_calendar_invite').doing).toBe('Preparing an invite for your OK')
    expect(describeTool('search_email').doing).toBe('Reading your email')
    expect(describeTool('confirm_action').doing).toBe('Sending it')
  })

  it('spots a tool that failed for want of Google', () => {
    expect(isGoogleError('google_scope_missing: reconnect Google')).toBe(true)
    expect(isGoogleError('rate_limited')).toBe(false)
  })
})
