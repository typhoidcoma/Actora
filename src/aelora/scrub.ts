// Sometimes the model writes a tool call into its reply instead of making it
// ("perform_reaction{anchor:…,intensity:low}perfect. i've blocked…"). The
// server should catch that; until it does, never show it.

/** Wendy's tools on Aelora (WEBSOCKET.md → tool catalog). */
const TOOLS = new Set([
  'perform_reaction',
  'ui_action',
  'get_app_state',
  'web_search',
  'remember',
  'list_remembered',
  'update_remembered',
  'forget_remembered',
  'search_memory',
  'forget_fact',
  'search_conversations',
  'search_knowledge_base',
  'schedule_notification',
  'list_notifications',
  'mark_notification_read',
  'delete_notification',
  'start_session',
  'end_session',
  'update_session',
  'list_sessions',
  'create_event',
  'list_events',
  'update_event',
  'delete_event',
  'create_task',
  'list_tasks',
  'complete_task',
  'update_task',
  'delete_task',
  'create_goal',
  'list_goals',
  'update_goal',
  'complete_goal',
  'delete_goal',
  'search_email',
  'read_email_thread',
  'read_email_attachment',
  'list_email_labels',
  'get_email_settings',
  'modify_email',
  'create_email_label',
  'untrash_email',
  'delete_email_filter',
  'draft_email',
  'forward_email',
  'propose_calendar_invite',
  'propose_invite_change',
  'propose_email_change',
  'confirm_action',
  'discard_action',
])

// name{…} or name(…) with no nested brackets: tool-call syntax, not prose.
const CALL = /\b([a-z]+(?:_[a-z]+)*)\s*([({])([^(){}]*)[)}]/g
// The same, still arriving at the very end of a stream.
const OPEN = /\b([a-z]+(?:_[a-z]+)*)\s*[({][^(){}]*$/

/**
 * Braces after a snake_case or tool name are never prose. Parentheses count only
 * for multi-word tool names (ui_action(...)), or a one-word tool (remember) whose
 * contents look like arguments: "remember (it's important)" stays.
 */
const isCall = (name: string, bracket: string, inner: string) => {
  if (bracket === '{') return TOOLS.has(name) || name.includes('_')
  if (!TOOLS.has(name)) return false
  return name.includes('_') || /[:=]/.test(inner)
}

/** Reply text with leaked tool calls removed (and a half-arrived one held back while streaming). */
export function scrubToolLeaks(text: string, streaming = false): string {
  if (!text) return text
  let out = text.replace(CALL, (m, name: string, bracket: string, inner: string) =>
    isCall(name, bracket, inner) ? ' ' : m,
  )
  if (streaming) {
    const open = OPEN.exec(out)
    if (open && (TOOLS.has(open[1]) || open[1].includes('_'))) out = out.slice(0, open.index)
  }
  // Tidy the seam a removed call leaves behind.
  return out.replace(/^[ \t]+/, '').replace(/[ \t]{2,}/g, ' ')
}
