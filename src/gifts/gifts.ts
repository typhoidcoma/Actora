import { ask } from '../aelora/client'
import { gifts, useGifts } from '../stores/gifts'
import { withUndo } from '../stores/toast'
import { toGift, type Gift } from './gift'

const PAGE = 24

/** Her gifts from the server: the first page, or (more) the next one. */
export async function loadGifts(more = false): Promise<void> {
  const s = useGifts.getState()
  if (s.status === 'loading' || (more && !s.nextBefore)) return
  gifts.loading()
  const r = await ask<{ type: string; images?: unknown; nextBefore?: unknown }>(
    { type: 'image.list', gifts: true, limit: PAGE, ...(more && s.nextBefore ? { before: s.nextBefore } : {}) },
    'image.list',
  )
  // A guest, or the server's pictures switched off: an empty shelf, not an error.
  if (!r || !Array.isArray(r.images)) {
    if (!more) gifts.failed()
    else useGifts.setState({ status: 'ready' })
    return
  }
  const list = r.images.map(toGift).filter((g): g is Gift => g !== null)
  gifts.load(list, typeof r.nextBefore === 'string' && r.nextBefore ? r.nextBefore : null, more)
}

/**
 * A picture wouldn't load: most likely its signed address ran out after a week.
 * Fetch the list again for fresh ones, at most once a minute.
 */
let lastRefresh = 0
export function refreshGifts(): void {
  if (Date.now() - lastRefresh < 60_000) return
  lastRefresh = Date.now()
  void loadGifts()
}

/** Take a gift off the shelf, with an Undo; the server forgets it only once the Undo has passed. */
export function removeGift(id: string): void {
  const g = useGifts.getState().items[id]
  if (!g) return
  withUndo(
    'Gift removed',
    () => gifts.remove(id),
    () => void ask({ type: 'image.delete', imageId: id }, 'image.deleted'),
    () => gifts.add(g, false),
  )
}

const extOf = (g: Gift, type: string) =>
  /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /jpe?g/.test(type) ? 'jpg' : g.url.startsWith('data:image/svg') ? 'svg' : 'png'

async function fileOf(g: Gift): Promise<File> {
  const res = await fetch(g.url, { referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error(`gift ${res.status}`)
  const blob = await res.blob()
  return new File([blob], `gift-${g.createdAt.slice(0, 10)}.${extOf(g, blob.type)}`, { type: blob.type || 'image/png' })
}

/** Keep a copy on this device. */
export async function saveGift(g: Gift): Promise<boolean> {
  try {
    const file = await fileOf(g)
    const href = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = href
    a.download = file.name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
    return true
  } catch {
    return false
  }
}

/** The phone's share sheet can take a picture. */
export const canShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/** Through the share sheet: the picture itself where files can be shared, else its address. */
export async function shareGift(g: Gift, from: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const file = await fileOf(g).catch(() => null)
    const text = g.note ? `${g.note}\n— ${from}` : `A gift from ${from}`
    if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text })
    else await navigator.share({ url: g.url, text })
    return 'shared'
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
