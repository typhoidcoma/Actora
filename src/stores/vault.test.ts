import { describe, expect, it } from 'vitest'
import { grouped, useVault, vault, type VaultEntry } from './vault'

const e = (id: string, category: string | null, at: string): VaultEntry => ({
  id,
  content: id,
  category,
  confidence: 1,
  source: null,
  created_at: at,
})

describe('memories', () => {
  it('groups by category in display order, newest first, unknown into Context', () => {
    const g = grouped({
      a: e('a', 'routine', '2026-10-01'),
      b: e('b', 'preference', '2026-10-01'),
      c: e('c', 'preference', '2026-10-05'),
      d: e('d', 'behavioral', '2026-10-02'),
    })
    expect(g.map((x) => x.id)).toEqual(['preference', 'routine', 'context'])
    expect(g[0].items.map((x) => x.id)).toEqual(['c', 'b'])
    expect(g[2].items.map((x) => x.id)).toEqual(['d'])
  })

  it("follows Wendy's live remember/forget broadcasts", async () => {
    const { routeFrame } = await import('../aelora/router')
    vault.set([e('x', 'value', '2026-10-01')])
    const bus = { send: () => true, subscribe: () => () => {} }
    routeFrame(
      { type: 'event', event: 'vault', data: { type: 'vault:created', entry: e('y', 'skill', '2026-10-09') } },
      bus as never,
    )
    routeFrame({ type: 'event', event: 'vault', data: { type: 'vault:deleted', id: 'x' } }, bus as never)
    routeFrame({ type: 'event', event: 'vault', data: { type: 'vault:deleted', id: 'not-ours' } }, bus as never)
    expect(Object.keys(useVault.getState().entries)).toEqual(['y'])
  })

  it('Wendy can open and close Memories', async () => {
    const { runUiAction, AVAILABLE_ACTIONS } = await import('../aelora/router')
    const { useUi, contextKeyOf } = await import('./ui')
    expect(AVAILABLE_ACTIONS).toContain('vault.open')
    runUiAction('vault.open', {})
    expect(contextKeyOf(useUi.getState())).toBe('vault')
    runUiAction('vault.close', {})
    expect(useUi.getState().vault).toBe(false)
  })
})
