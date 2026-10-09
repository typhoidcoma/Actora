/** ui_action names we accept (the catalog is documented in router.ts and docs/wendy-ui.md). */
export const AVAILABLE_ACTIONS = [
  'home.show',
  'priorities.set',
  'card.open',
  'card.close',
  'item.focus',
  'list.open',
  'tile.focus',
  'tile.close',
  'reader.open',
  'reader.close',
  'finds.open',
  'finds.close',
  'finds.focus',
  'finds.refresh',
  'finds.set',
  'vault.open',
  'vault.close',
  'vault.search',
  'chat.open',
  'chat.close',
  'options.set',
  'reply.show',
  'reply.hide',
  'theme.set',
  'colors.set',
  'colors.reset',
  'voice.listen',
  'push.offer',
] as const

const KNOWN = new Set<string>(AVAILABLE_ACTIONS)

/**
 * A tool name that is really one of our ui_actions ("colors_set", "colors.set",
 * "unknown_tool:colors_set"), as the action name; null for real tools.
 */
export function strayAction(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const m = /^(?:unknown_tool:)?([a-z]+)[._]([a-z]+)$/.exec(name.trim().toLowerCase())
  const action = m ? `${m[1]}.${m[2]}` : null
  return action && KNOWN.has(action) ? action : null
}

/** The arguments of such a call, from the tool.progress argsSummary (JSON; null if cut off or not an object). */
export function actionArgs(summary: unknown): Record<string, unknown> | null {
  if (typeof summary !== 'string')
    return summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : null
  if (!summary.trim()) return {}
  try {
    const v: unknown = JSON.parse(summary)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const o = v as Record<string, unknown>
    // Some calls wrap them: {action, args}.
    return o.args && typeof o.args === 'object' && !Array.isArray(o.args) ? (o.args as Record<string, unknown>) : o
  } catch {
    return null
  }
}
