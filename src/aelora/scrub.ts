// Sometimes the model writes a tool call into its reply instead of making it
// ("perform_reaction{anchor:…,intensity:low}perfect. i've blocked…"). The
// server should catch that; until it does, never show it.

/** Wendy's tools on Aelora (WEBSOCKET.md → tool catalog). */
import { AVAILABLE_ACTIONS } from './actions'

const KNOWN_ACTIONS = new Set<string>(AVAILABLE_ACTIONS)
const ACTION_NAMES: readonly string[] = AVAILABLE_ACTIONS

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
const TOOL_NAMES = [...TOOLS]

// name{…} or name(…) with no nested brackets: tool-call syntax, not prose.
const CALL = /\b([a-z]+(?:_[a-z]+)*)\s*([({])([^(){}]*)[)}]/gi
// The same, still arriving at the very end of a stream.
const OPEN = /\b([a-z]+(?:_[a-z]+)*)\s*[({][^(){}]*$/i

/**
 * Braces after a snake_case or tool name are never prose. Parentheses count only
 * for multi-word tool names (ui_action(...)), or a one-word tool (remember) whose
 * contents look like arguments: "remember (it's important)" stays.
 */
const isCall = (raw: string, bracket: string, inner: string) => {
  const name = raw.toLowerCase()
  if (bracket === '{') return TOOLS.has(name) || name.includes('_')
  if (!TOOLS.has(name)) return false
  return name.includes('_') || /[:=]/.test(inner)
}

// Answer links: "[keep it open](say:yes, keep this reader open)". Some chat
// clients render these as tap-to-reply; here the answers belong on the pills
// (options.set), so they come out of the text and become options instead.
const SAY_LINK = /\[([^\]\n]{1,120})\]\(\s*say:([^)\n]*)\)/g
// One still arriving at the end of a stream: "[keep it", "[keep it](sa"…
const SAY_OPEN = /\[[^\]\n]*(?:\](?:\((?:\s*s(?:a(?:y(?::[^)\n]*)?)?)?)?)?)?$/

/** The answers Wendy wrote as say: links, in order, deduped. */
export function sayLinks(text: string): Array<{ label: string; say: string }> {
  const out: Array<{ label: string; say: string }> = []
  for (const m of text.matchAll(SAY_LINK)) {
    const label = m[1].trim()
    const say = m[2].trim() || label
    if (label && !out.some((o) => o.label.toLowerCase() === label.toLowerCase())) out.push({ label, say })
  }
  return out
}

// A screen action written out as text, with any amount of nesting in its args:
// "[options.set]{options:[{label:…},{…}]}", "options.set{…}", "`reader.open`{}".
const ACTION_HEAD = /[[`*]*\b([a-z]+\.[a-z]+)\b[\]`*]*\s*(?=[({])/gi

/** Where the bracket opened at `from` closes (matching nesting), or -1 if it hasn't arrived yet. */
function closing(text: string, from: number): number {
  const open = text[from]
  const close = open === '{' ? '}' : ')'
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      depth--
      if (depth === 0) return c === close ? i : -1
    }
  }
  return -1
}

/** Screen actions written into the reply, found with their (balanced) argument text. */
export function textActions(
  text: string,
  /** Still streaming: an action not closed yet runs to the end (it's still arriving). */
  openEnded = true,
): Array<{ action: string; start: number; end: number; args: string }> {
  const out: Array<{ action: string; start: number; end: number; args: string }> = []
  for (const m of text.matchAll(ACTION_HEAD)) {
    const action = m[1].toLowerCase()
    if (!KNOWN_ACTIONS.has(action)) continue
    // Inside an action already found (named in its arguments): part of that one.
    if (out.some((a) => m.index >= a.start && m.index < a.end)) continue
    const open = m.index + m[0].length
    const end = closing(text, open)
    // Never closes in a finished reply: prose like "theme.set (dusk — enjoy!", leave it.
    if (end < 0 && !openEnded) continue
    out.push({
      action,
      start: m.index,
      end: end < 0 ? text.length : end + 1,
      args: end < 0 ? '' : text.slice(open + 1, end),
    })
  }
  return out
}

/**
 * The answers of an options.set written out as text, read loosely (the model
 * leaves keys and values unquoted): {label:…,say:…} pairs.
 */
export function textOptions(text: string): Array<{ label: string; say: string }> {
  const out: Array<{ label: string; say: string }> = []
  for (const a of textActions(text)) {
    if (a.action !== 'options.set') continue
    // Each {…} answer: its label runs up to ",say:" (labels may hold commas), its say to the "}".
    for (const obj of a.args.match(/\{[^{}]*\}/g) ?? []) {
      const m = /^\{\s*"?label"?\s*:\s*"?([^{}]*?)"?\s*(?:,\s*"?say"?\s*:\s*"?([^{}]*?)"?\s*)?\}$/.exec(obj)
      const label = m?.[1]?.trim()
      if (label) out.push({ label, say: (m?.[2] ?? label).trim() })
    }
  }
  return out
}

/** Reply text with leaked tool calls removed (and a half-arrived one held back while streaming). */
export function scrubToolLeaks(text: string, streaming = false): string {
  if (!text) return text
  // 1. Strip the Markdown the model wraps calls in; all of these render as the bare
  //    call: `perform_reaction`{…}, **perform_reaction**{…}, perform\_reaction\{…\}.
  let out = text.replace(/\\([_{}()[\]])/g, '$1').replace(/(`+|\*{1,2})([a-z]+(?:_[a-z]+)*)\1(?=\s*[({])/gi, '$2')
  // 2. Screen actions written out (options.set{…}, nested args and all). One still
  //    arriving at the end of a stream is cut from where it starts.
  for (const a of textActions(out, streaming).reverse()) out = `${out.slice(0, a.start)} ${out.slice(a.end)}`
  // 3. Drop the tool calls themselves.
  out = out
    .replace(CALL, (m, name: string, bracket: string, inner: string) => (isCall(name, bracket, inner) ? ' ' : m))
    // 3. Answer links go to the pills (sayLinks); a list item that held one goes with it.
    .replace(new RegExp(`^[ \\t]*(?:[-*+]|\\d+\\.)[ \\t]+${SAY_LINK.source}[ \\t]*$`, 'gm'), '')
    .replace(SAY_LINK, '')
  if (streaming) {
    const open = OPEN.exec(out)
    if (open && (TOOLS.has(open[1].toLowerCase()) || open[1].includes('_'))) out = out.slice(0, open.index)
    // Hold back a last word that may be the start of a call ("perf", "`perform_re"…):
    // it shows a token later if it was just a word.
    const tail = /(?:`+|\*+)?([a-z_]+)(?:`+|\*+)?$/.exec(out)
    if (tail && TOOL_NAMES.some((t) => t.startsWith(tail[1]))) out = out.slice(0, tail.index)
    // A screen action's name still arriving ("[options.se", "reader.").
    const act = /\[?\b([a-z]+\.[a-z]*)\]?$/.exec(out)
    if (act && ACTION_NAMES.some((a) => a.startsWith(act[1]))) out = out.slice(0, act.index)
    // An opening ` or ** with nothing after it yet: wait to see what it wraps.
    out = out.replace(/(?:`+|\*+)$/, '')
    // Hold back a link that might turn out to be an answer link.
    const link = SAY_OPEN.exec(out)
    if (link) out = out.slice(0, link.index)
  }
  // Tidy the seams removed calls and links leave behind.
  out = out
    .replace(/^[ \t]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  return streaming ? out : out.trimEnd()
}
