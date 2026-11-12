import { create } from 'zustand'
import type { Gift } from '../gifts/gift'

/**
 * Her gifts, newest first. Fetched the first time Profile opens (not at start-up),
 * and again when a picture's signed address has run out.
 */
export interface GiftsState {
  items: Record<string, Gift>
  order: string[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Where the next page starts; null when there are no more. */
  nextBefore: string | null
  /** Gifts she gave that the user hasn't opened yet: the dot on Profile. */
  unseen: string[]
  /** The gift shown large. */
  open: string | null
}

const UNSEEN_KEY = 'actora.gifts.unseen'

function readUnseen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(UNSEEN_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []
  } catch {
    return []
  }
}

function saveUnseen(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(UNSEEN_KEY, JSON.stringify(ids.slice(0, 50)))
    else localStorage.removeItem(UNSEEN_KEY)
  } catch {
    /* private mode: the dot just won't survive a reload */
  }
}

const EMPTY: Omit<GiftsState, 'unseen'> = { items: {}, order: [], status: 'idle', nextBefore: null, open: null }

export const useGifts = create<GiftsState>(() => ({ ...EMPTY, unseen: readUnseen() }))

const newestFirst = (items: Record<string, Gift>) =>
  Object.values(items)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((g) => g.imageId)

const setUnseen = (unseen: string[]) => {
  saveUnseen(unseen)
  useGifts.setState({ unseen })
}

export const gifts = {
  loading: () => useGifts.setState({ status: 'loading' }),
  failed: () => useGifts.setState({ status: 'error' }),
  /** A page from the server: the first page replaces what we hold (fresh addresses), later pages add to it. */
  load(list: Gift[], nextBefore: string | null, append = false) {
    useGifts.setState((s) => {
      const items = append ? { ...s.items } : {}
      for (const g of list) items[g.imageId] = g
      return { items, order: newestFirst(items), nextBefore, status: 'ready' }
    })
  },
  /** One she just gave: on the shelf at once, and new until opened. */
  add(g: Gift, isNew = true) {
    useGifts.setState((s) => {
      const items = { ...s.items, [g.imageId]: g }
      return { items, order: newestFirst(items) }
    })
    if (isNew && !useGifts.getState().unseen.includes(g.imageId)) setUnseen([g.imageId, ...useGifts.getState().unseen])
  },
  remove(id: string) {
    useGifts.setState((s) => {
      if (!s.items[id]) return s
      const items = { ...s.items }
      delete items[id]
      return { items, order: s.order.filter((x) => x !== id), open: s.open === id ? null : s.open }
    })
    gifts.markSeen(id)
  },
  markSeen(id: string) {
    const { unseen } = useGifts.getState()
    if (unseen.includes(id)) setUnseen(unseen.filter((x) => x !== id))
  },
  /** Show one large (and count it as opened), or close it. */
  show(id: string | null) {
    useGifts.setState({ open: id })
    if (id) gifts.markSeen(id)
  },
  /** Someone else signs in: none of the last person's gifts stay. */
  reset() {
    saveUnseen([])
    useGifts.setState({ ...EMPTY, unseen: [] })
  },
}
