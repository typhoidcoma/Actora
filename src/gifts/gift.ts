// A gift: a picture she made for the user, with a short note (Aelora's give_gift).
// It arrives as an ImageRecord with `gift: {note, persona}`; images the app asked
// for itself have `gift: null` and are not gifts.

export const GIFT_NOTE_MAX = 280

export interface Gift {
  imageId: string
  /** Signed, and only good for about a week: never kept, the list is fetched again instead. */
  url: string
  note: string
  persona: string
  createdAt: string
  width: number | null
  height: number | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const dim = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

/** A picture we can show: a web address, or an inline image (the mock server's). */
const showable = (url: string) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url)

/** One gift from the server's record, or null when it isn't a gift or isn't whole. */
export function toGift(raw: unknown): Gift | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const gift = r.gift
  if (!gift || typeof gift !== 'object') return null
  const imageId = str(r.imageId).trim()
  const url = str(r.url).trim()
  if (!imageId || imageId.length > 100 || !showable(url)) return null
  const g = gift as Record<string, unknown>
  const at = str(r.createdAt)
  return {
    imageId,
    url,
    note: str(g.note).trim().slice(0, GIFT_NOTE_MAX),
    persona: str(g.persona).slice(0, 60),
    createdAt: Number.isFinite(Date.parse(at)) ? at : new Date().toISOString(),
    width: dim(r.width),
    height: dim(r.height),
  }
}
