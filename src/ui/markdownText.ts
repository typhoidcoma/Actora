/** While streaming, hold back a trailing `[` / `![` until its `)` arrives. */
export function stableMarkdown(text: string): string {
  const k = text.lastIndexOf('[')
  if (k >= 0 && !text.slice(k).includes(')')) return text.slice(0, k > 0 && text[k - 1] === '!' ? k - 1 : k)
  return text
}

/** Wendy's Markdown flattened to one calm line of prose for the header line. */
export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_~`#>]+/g, '')
    .replace(/^\s*(?:[-+]|\d+\.)\s+/gm, '· ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** The first sentence of a reply, for Wendy's one-line voice above the grid. */
export function firstSentence(text: string, max = 160): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text)
  const s = (m ? m[1] : text).trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/** A reply with more than its first sentence: her line shows "Read all" (and the chat opens for it). */
export function hasMore(md: string): boolean {
  const full = plainText(md)
  return full.length > firstSentence(full).length + 2
}

/**
 * The end of what she's typing, whole sentences where they fit: while a reply
 * streams outside the chat, the line follows her latest words instead of
 * sitting on the first sentence.
 */
export function liveTail(text: string, max = 150): string {
  const t = text.trim()
  if (t.length <= max) return t
  const parts = t.match(/[^.!?]+(?:[.!?]+\s*|$)/g) ?? [t]
  let out = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    if (out && out.length + parts[i].length > max) break
    out = parts[i] + out
  }
  out = out.trim()
  if (out.length <= max) return `…${out}`
  // One long sentence still arriving: its last words, from a word boundary.
  return `…${out.slice(-(max - 1)).replace(/^\S*\s+/, '')}`
}

/** A question big enough that the answer deserves the full chat. */
export function isLargeQuestion(text: string): boolean {
  const t = text.trim()
  return t.length >= 60 || t.split(/\s+/).length >= 9
}

/** A reply too big for her line: long, structured, or carrying images/tables (the chat opens for it). */
export function isRichReply(md: string): boolean {
  return (
    md.length > 320 ||
    /!\[[^\]]*]\(/.test(md) ||
    /^\s*\|.*\|\s*$/m.test(md) ||
    (md.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) ?? []).length >= 3 ||
    /```/.test(md)
  )
}

/**
 * Markdown as text worth pasting: paragraphs and list lines kept, links as
 * "text (url)", emphasis and heading marks dropped, images left out.
 */
/**
 * Text split into plain parts and links: Markdown links ([label](url)) keep
 * their label; bare URLs lose trailing punctuation ("…/a." links to …/a) and
 * keep balanced parentheses (wiki/Foo_(bar)).
 */
export function linkParts(text: string): Array<string | { href: string; label: string }> {
  const out: Array<string | { href: string; label: string }> = []
  const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"]+/g
  let last = 0
  for (const m of text.matchAll(re)) {
    let href = m[2] ?? m[0]
    let label = m[1] ?? ''
    let end = m.index + m[0].length
    if (!m[2]) {
      // Bare URL: shed trailing punctuation, and a ")" that has no "(" of its own.
      for (;;) {
        const tail = href.at(-1)
        const opens = (href.match(/\(/g) ?? []).length
        const closes = (href.match(/\)/g) ?? []).length
        if (tail && /[.,;:!?'"]/.test(tail)) href = href.slice(0, -1)
        else if (tail === ')' && closes > opens) href = href.slice(0, -1)
        else break
      }
      end = m.index + href.length
      label = href.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)
    }
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push({ href, label })
    last = end
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function copyableText(md: string): string {
  return md
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_](\S(?:.*?\S)?)[*_](?=[^*\w]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[*+][ \t]+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
