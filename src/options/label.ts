// Pill labels are tap targets, not sentences. Whatever the agent (or the app)
// writes, a label is cut down to a short phrase at a word boundary: never an
// ellipsis, never a two-line wall. The full sentence still goes to the agent as the
// option's `say`, so nothing is lost by shortening what's shown.

export const LABEL_MAX = 24

/** Openers that add words but no meaning to a button. */
const FILLER =
  /^(?:(?:yes|yeah|yep|ok(?:ay)?|sure|great|perfect|cool|please|so|and|actually),?\s+)*(?:can|could|would|will) you\s+|^(?:(?:yes|yeah|yep|ok(?:ay)?|sure|great|perfect|cool|so|and|actually),?\s+)+|^(?:let'?s|help me|i(?:'d)? (?:want|like|need) to|i'll|please)\s+/i

/** Words a cut phrase shouldn't end on. */
const DANGLING =
  /\s+(?:the|a|an|to|for|and|or|but|of|with|on|in|at|by|from|my|your|our|its|is|are|be|so|as|if|into|about)$/i

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Whole words from the start, up to `max` characters, not ending on a filler word. */
function wordsUpTo(text: string, max: number): string {
  let out = ''
  for (const w of text.split(/\s+/)) {
    const next = out ? `${out} ${w}` : w
    if (next.length > max) break
    out = next
  }
  while (DANGLING.test(out)) out = out.replace(DANGLING, '')
  return out
}

export function shortLabel(raw: string, max = LABEL_MAX): string {
  const plain = raw.replace(/\s+/g, ' ').trim()
  // Short enough already: leave it exactly as written.
  if (plain.length <= max) return plain

  let t = plain
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[.!。…]+$/, '')
    .trim()
  // Nothing left (it was all an aside in brackets): work from the words as written.
  if (!t) t = plain.replace(/[()]/g, '').trim()
  const stripped = t.replace(FILLER, '').trim()
  // Keep the opener when it's most of the answer ("Yes please", "Sure thing").
  // (and an asked-for action loses its question mark: "Can you move it?" → "Move it").
  if (stripped.split(' ').length >= 2 && stripped !== t) t = stripped.replace(/\?$/, '')
  if (t.length <= max) return cap(t)

  // Long: prefer the first clause, if it's a real phrase on its own (a colon
  // isn't a break: "Got it: Design sync" needs both halves).
  const clause = t.split(/\s*(?:[,;]|—|–|\s-\s)\s*/)[0]
  if (clause.length <= max && clause.split(' ').length >= 2) return cap(clause)

  const cut = wordsUpTo(t, max)
  return cap(cut || t.slice(0, max).trim() || plain.slice(0, max).trim())
}
