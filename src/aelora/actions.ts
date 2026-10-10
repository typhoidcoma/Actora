/** ui_action names we advertise to Wendy (the catalog is documented in router.ts and docs/wendy-ui.md). */
export const AVAILABLE_ACTIONS = [
  'home.show',
  'priorities.set',
  'card.open',
  'card.close',
  'item.focus',
  'list.open',
  'tile.focus',
  'tile.close',
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
  'message.react',
  'theme.set',
  'colors.set',
  'colors.reset',
  'voice.listen',
  'push.offer',
  'checkins.set',
] as const

/**
 * Old names still obeyed (and scrubbed if written as text) but no longer advertised:
 * there is no reader, only the chat, and naming one made her talk about it;
 * reply.react became message.react (the emoji goes on the user's message).
 */
export const LEGACY_ACTIONS = ['reader.open', 'reader.close', 'reply.react'] as const

export const ACCEPTED_ACTIONS: readonly string[] = [...AVAILABLE_ACTIONS, ...LEGACY_ACTIONS]

const KNOWN = new Set<string>(ACCEPTED_ACTIONS)

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
