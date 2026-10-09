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

/** First few image URLs in a Markdown reply (web-search previews). */
export function imagesIn(md: string, max = 3): Array<{ alt: string; src: string }> {
  return [...md.matchAll(/!\[([^\]]*)]\((https?:[^)\s]+)\)/g)].slice(0, max).map(([, alt, src]) => ({ alt, src }))
}

/** The first sentence of a reply, for Wendy's one-line voice above the grid. */
export function firstSentence(text: string, max = 160): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text)
  const s = (m ? m[1] : text).trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}
