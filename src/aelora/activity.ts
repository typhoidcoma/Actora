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

export interface ToolWords {
  doing: string
  done: string
  icon: StepIcon
}

const writes = /create|add|update|edit|move|reschedule|delete|remove|complete|set|schedule|mark|save|store|write|log/

export function describeTool(name: string): ToolWords {
  const n = name.toLowerCase()
  const w = writes.test(n)
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
