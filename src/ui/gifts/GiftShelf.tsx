import { motion } from 'motion/react'
import { useEffect } from 'react'
import { loadGifts } from '../../gifts/gifts'
import { say } from '../../options/run'
import { useAgent } from '../../stores/agent'
import { gifts, useGifts } from '../../stores/gifts'
import { press } from '../motion'
import { GiftImage } from './GiftImage'

/** Her gifts on the user's profile, newest first: tap one to see it large with her note. */
export function GiftShelf() {
  const name = useAgent((s) => s.botName)
  const order = useGifts((s) => s.order)
  const items = useGifts((s) => s.items)
  const unseen = useGifts((s) => s.unseen)
  const status = useGifts((s) => s.status)
  const more = useGifts((s) => s.nextBefore !== null)

  // Fetched when the profile is first looked at, not at start-up.
  useEffect(() => {
    if (useGifts.getState().status === 'idle') void loadGifts()
  }, [])

  if (!order.length) {
    if (status === 'idle' || status === 'loading')
      return <div aria-label="Loading your gifts" className="h-[72px] animate-pulse rounded-[10px] bg-text/6" />
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[14px] text-muted">
          {status === 'error' ? "Your gifts didn't load." : `Nothing yet. ${name} can make you a picture.`}
        </p>
        <motion.button
          whileTap={press}
          onClick={() => (status === 'error' ? void loadGifts() : say(`Make me a picture as a gift`))}
          className="glass-pill h-11 shrink-0 rounded-[8px] px-4 text-[14px] font-semibold text-strong"
        >
          {status === 'error' ? 'Try again' : `Ask ${name} for one`}
        </motion.button>
      </div>
    )
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 @lg:grid-cols-4 @2xl:grid-cols-3">
        {order.map((id) => {
          const g = items[id]
          const isNew = unseen.includes(id)
          return (
            <li key={id} className="relative">
              <motion.button
                whileTap={press}
                onClick={() => gifts.show(id)}
                aria-label={`${isNew ? 'New gift' : 'Gift'}${g.note ? `: ${g.note}` : ''}`}
                className="block aspect-square w-full overflow-hidden rounded-[10px] bg-text/6"
              >
                <GiftImage gift={g} className="h-full w-full" />
              </motion.button>
              {isNew && (
                <span aria-hidden className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full bg-accent ring-2 ring-bg" />
              )}
            </li>
          )
        })}
      </ul>
      {more && (
        <motion.button
          whileTap={press}
          disabled={status === 'loading'}
          onClick={() => void loadGifts(true)}
          className="glass-pill mt-3 h-11 rounded-[8px] px-4 text-[14px] font-semibold text-strong disabled:opacity-60"
        >
          {status === 'loading' ? 'Loading…' : 'More'}
        </motion.button>
      )}
    </div>
  )
}
