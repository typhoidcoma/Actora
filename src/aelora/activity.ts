// What Wendy is doing, in words: tool calls from tool.progress / mindmap
// frames turned into a friendly "doing" line (and a "done" one for the trail).
// Tool names vary by deploy, so this matches on patterns, not an exact list.

export type StepIcon =
  | 'think'
  | 'search'
  | 'read'
  | 'memory'
  | 'calendar'
  | 'task'
  | 'goal'
  | 'bell'
  | 'note'
  | 'image'
  | 'weather'
  | 'screen'
  | 'tool'

interface ToolWords {
  doing: string
  done: string
  icon: StepIcon
}

const writes = /create|add|update|edit|move|reschedule|delete|remove|complete|set|schedule|mark|save|store|write|log/

export function describeTool(name: string): ToolWords {
  const n = name.toLowerCase()
  const w = writes.test(n)
  // Email and invites first ("propose_calendar_invite" isn't a calendar check).
  // Anything that waits for the user's OK says so.
  if (n === 'confirm_action') return { doing: 'Sending it', done: 'Sent it', icon: 'note' }
  if (n === 'discard_action') return { doing: 'Discarding it', done: 'Discarded it', icon: 'note' }
  if (/propose_calendar_invite|propose_invite_change/.test(n))
    return { doing: 'Preparing an invite for your OK', done: 'Invite ready for your OK', icon: 'calendar' }
  if (/draft_email|forward_email|propose_email_change/.test(n))
    return { doing: 'Drafting an email for your OK', done: 'Email ready for your OK', icon: 'note' }
  if (/search_email|read_email|email_thread|email_attachment|email_labels|email_settings/.test(n))
    return { doing: 'Reading your email', done: 'Read your email', icon: 'read' }
  if (/modify_email|email_label|untrash_email|email_filter/.test(n))
    return { doing: 'Tidying your inbox', done: 'Tidied your inbox', icon: 'note' }
  if (/web_?search|search_?web|google|bing|news/.test(n))
    return { doing: 'Searching the web', done: 'Searched the web', icon: 'search' }
  if (/fetch|browse|read_?url|open_?url|scrape|page|web_?read|crawl/.test(n))
    return { doing: 'Reading a page', done: 'Read a page', icon: 'read' }
  if (/image|photo|picture/.test(n)) return { doing: 'Finding pictures', done: 'Found pictures', icon: 'image' }
  if (/conversation|history|transcript/.test(n))
    return { doing: 'Looking back through our chats', done: 'Looked back through our chats', icon: 'memory' }
  if (/memory|recall|fact|profile|remember/.test(n) && !w)
    return { doing: 'Checking what I remember', done: 'Checked what I remember', icon: 'memory' }
  if (/memory|fact|remember|note|journal/.test(n)) return { doing: 'Making a note', done: 'Made a note', icon: 'note' }
  if (/calendar|event|meeting/.test(n))
    return w
      ? { doing: 'Updating your calendar', done: 'Updated your calendar', icon: 'calendar' }
      : { doing: 'Checking your calendar', done: 'Checked your calendar', icon: 'calendar' }
  if (/task|todo/.test(n))
    return w
      ? { doing: 'Updating your tasks', done: 'Updated your tasks', icon: 'task' }
      : { doing: 'Looking at your tasks', done: 'Looked at your tasks', icon: 'task' }
  if (/goal|habit/.test(n))
    return w
      ? { doing: 'Updating your goals', done: 'Updated your goals', icon: 'goal' }
      : { doing: 'Looking at your goals', done: 'Looked at your goals', icon: 'goal' }
  if (/notif|remind|alert|push/.test(n))
    return w
      ? { doing: 'Setting a reminder', done: 'Set a reminder', icon: 'bell' }
      : { doing: 'Checking reminders', done: 'Checked reminders', icon: 'bell' }
  if (/weather|forecast/.test(n)) return { doing: 'Checking the weather', done: 'Checked the weather', icon: 'weather' }
  if (/ui_?action|screen|display|show/.test(n))
    return { doing: 'Arranging your screen', done: 'Arranged your screen', icon: 'screen' }
  const human = name.replace(/[_-]+/g, ' ').trim()
  const label = human ? human[0].toUpperCase() + human.slice(1) : 'Working'
  return { doing: label, done: label, icon: 'tool' }
}

/**
 * A ui_action as a step, by what it did. Routine screen moves (setting the
 * pills, closing panels, showing the reply) return null: the screen changing
 * says it, and a trail of "Arranged your screen" looked like something broke.
 */
const UI_WORDS: Record<string, ToolWords> = {
  'colors.set': { doing: 'Restyling the app', done: 'Restyled the app', icon: 'screen' },
  'colors.reset': { doing: 'Restoring the colours', done: 'Restored the colours', icon: 'screen' },
  'theme.set': { doing: 'Switching the theme', done: 'Switched the theme', icon: 'screen' },
  'priorities.set': { doing: 'Re-ranking your cards', done: 'Re-ranked your cards', icon: 'screen' },
  'finds.set': { doing: 'Laying out your finds', done: 'Laid out your finds', icon: 'image' },
  'finds.refresh': { doing: 'Hunting for fun finds', done: 'Hunted for fun finds', icon: 'search' },
}

export function describeUiAction(action: string | null): ToolWords | null {
  return (action && UI_WORDS[action]) || null
}

/** Which ui_action a ui_action tool call ran, from its argsSummary (JSON, maybe cut off). */
export function uiActionName(argsSummary: unknown): string | null {
  if (argsSummary && typeof argsSummary === 'object') {
    const a = (argsSummary as { action?: unknown }).action
    return typeof a === 'string' ? a : null
  }
  if (typeof argsSummary !== 'string') return null
  return /"action"\s*:\s*"([a-z]+\.[a-z]+)"/.exec(argsSummary)?.[1] ?? null
}

/**
 * The interesting argument from a tool's argsSummary (a JSON string, often
 * truncated): the search query, the page's host, a title. Null if nothing
 * human-readable is in there.
 */
export function toolDetail(argsSummary: unknown): string | null {
  if (typeof argsSummary !== 'string' || !argsSummary.trim()) return null
  let args: Record<string, unknown> | null = null
  try {
    const v: unknown = JSON.parse(argsSummary)
    if (v && typeof v === 'object') args = v as Record<string, unknown>
  } catch {
    // Truncated JSON: pull the first string field we recognise.
  }
  const pick = (key: string): string | null => {
    if (args) return typeof args[key] === 'string' ? (args[key] as string) : null
    const m = argsSummary.match(new RegExp(`"${key}"\\s*:\\s*"([^"]{1,160})`))
    return m ? m[1] : null
  }
  const url = pick('url') ?? pick('href')
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url.slice(0, 60)
    }
  }
  for (const key of ['query', 'q', 'search', 'title', 'name', 'text', 'topic', 'prompt']) {
    const v = pick(key)?.trim()
    if (v) return v.length > 70 ? `${v.slice(0, 68)}…` : v
  }
  return null
}

/** While no tool is running, how the thinking line reads as time passes. */
export function thinkingWords(ms: number): string {
  if (ms < 4000) return 'Thinking'
  if (ms < 10_000) return 'Thinking it through'
  if (ms < 20_000) return 'Pulling it together'
  return 'Still on it'
}
