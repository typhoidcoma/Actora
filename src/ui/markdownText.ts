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

/** A question big enough that the answer deserves the full chat. */
export function isLargeQuestion(text: string): boolean {
  const t = text.trim()
  return t.length >= 60 || t.split(/\s+/).length >= 9
}

/** A reply that won't fit box 4: long, structured, or carrying images/tables. */
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
