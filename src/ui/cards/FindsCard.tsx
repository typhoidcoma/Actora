import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { hunt, unseenCount, useFinds } from '../../finds/finds'
import { ui } from '../../stores/ui'
import { useMetrics } from '../../stores/metrics'
import type { Corner } from '../tiles/Face'
import { CardShell } from './CardShell'
import { ROLE } from '../brand'

const ON_IMAGE = ROLE.onImage
const SCRIM = 'linear-gradient(to top, rgb(30 24 34 / 0.9) 8%, rgb(30 24 34 / 0.45) 52%, rgb(30 24 34 / 0.12))'
const ROTATE_MS = 7000

/**
 * Box 4: fun things Wendy found on the web for this user. Their
 * images crossfade behind a big count of finds not yet seen; tap to open them.
 */
export function FindsCard({ corner, hidden }: { corner: Corner; hidden: boolean }) {
  const { items, status, seen } = useFinds()
  const unseen = unseenCount({ items, seen })
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (hidden || reduced || items.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [hidden, reduced, items.length])

  const stack = useMetrics((m) => m.stack)
  const f = items.length ? items[index % items.length] : null
  const hunting = status === 'hunting'
  const off = status === 'unavailable' && !items.length

  return (
    <CardShell
      layoutId="finds-card"
      corner={corner}
      accent={ROLE.finds}
      hidden={hidden}
      label={items.length ? `${unseen} fun things to see — open` : 'Find fun things for me'}
      onOpen={() => (items.length ? ui.openFinds() : off ? undefined : hunt())}
    >
      <div className="relative h-full w-full" style={{ color: ON_IMAGE }}>
        {/* Image layer: crossfades with a slow push-in. */}
        <AnimatePresence initial={false}>
          {f?.image ? (
            <motion.img
              key={f.id}
              src={f.image}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.9 }, scale: { duration: ROTATE_MS / 1000, ease: 'linear' } }}
            />
          ) : (
            <motion.div
              key="no-image"
              className="absolute inset-0"
              style={{ background: ROLE.findsFallback }}
              animate={hunting ? { opacity: [0.75, 1, 0.75] } : { opacity: 1 }}
              transition={hunting ? { duration: 2.4, repeat: Infinity } : undefined}
            />
          )}
        </AnimatePresence>
        <div aria-hidden className="absolute inset-0" style={{ background: SCRIM }} />

        <div
          className={`relative flex h-full flex-col justify-between ${stack ? 'p-3' : 'p-[max(14px,calc(var(--grid)*0.038))]'}`}
        >
          {/* Hero count, top right (the orb's notch is top left). */}
          {/* Stacked phones: count and label share one line so the find keeps its room. */}
          <div className={stack ? 'flex items-baseline justify-end gap-2' : 'text-right'}>
            <div
              className="display num leading-[0.85]"
              style={{
                // Short, wide stacked card on phones: a smaller count leaves room for the find.
                fontSize: stack
                  ? 'clamp(26px, calc(var(--grid) * 0.09), 36px)'
                  : 'clamp(40px, calc(var(--grid) * 0.15), 84px)',
                fontWeight: 700,
                letterSpacing: '-0.05em',
              }}
            >
              {hunting && !items.length ? '…' : items.length ? unseen || items.length : '+'}
            </div>
            <div className={`${stack ? '' : 'mt-1'} text-[max(13px,calc(var(--grid)*0.026))] font-semibold opacity-90`}>
              {hunting && !items.length
                ? 'Wendy is hunting…'
                : !items.length
                  ? 'Find fun things'
                  : unseen
                    ? `fun thing${unseen === 1 ? '' : 's'} to see`
                    : 'finds today, all seen'}
            </div>
          </div>

          {/* The current find. */}
          <AnimatePresence mode="wait" initial={false}>
            {f ? (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4 }}
                className="min-w-0"
              >
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px] font-bold">
                  <span style={{ color: ROLE.onImageTag }}>{f.tag}</span>
                  <span className="num font-medium opacity-70">
                    {(index % items.length) + 1} / {items.length}
                  </span>
                </div>
                <div
                  className={`display ${stack ? 'line-clamp-1' : 'line-clamp-2'}`}
                  style={{
                    fontSize: 'clamp(17px, calc(var(--grid) * 0.052), 28px)',
                    fontWeight: 700,
                    lineHeight: 1.02,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {f.title}
                </div>
                {f.why && !stack && (
                  <div className="mt-1 line-clamp-1 text-[max(12px,calc(var(--grid)*0.024))] opacity-85">{f.why}</div>
                )}
              </motion.div>
            ) : (
              <motion.div key="empty" className="text-[max(13px,calc(var(--grid)*0.026))] opacity-90">
                {off
                  ? 'Fun finds need separate conversations, which this server has turned off.'
                  : hunting
                    ? 'Searching the web for things you’ll like.'
                    : 'Tap and Wendy will find you something fun.'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </CardShell>
  )
}
