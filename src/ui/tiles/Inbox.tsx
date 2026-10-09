import { motion } from 'motion/react'
import { markNotificationRead } from '../../aelora/client'
import { AnimatedNumber } from '../AnimatedNumber'
import { ago } from '../format'
import { morph, press } from '../motion'
import { useInbox, useNow } from './data'
import { Face, type Corner } from './Face'
import { Empty, Section } from './parts'

export const INBOX_ACCENT = '#B39AE6'

export function InboxFace({ corner }: { corner: Corner }) {
  const now = useNow(30_000)
  const { items, unread } = useInbox(now)
  const latest = items.find((n) => !n.read_at) ?? items[0]
  return (
    <Face
      corner={corner}
      accent={INBOX_ACCENT}
      label="Inbox"
      value={<AnimatedNumber value={unread} />}
      unit="new"
      line={latest?.title ?? 'Nothing new'}
      motif={
        unread > 0 && (
          <div className="flex gap-1.5">
            {Array.from({ length: Math.min(unread, 8) }, (_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18, delay: i * 0.03 }}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: INBOX_ACCENT }}
              />
            ))}
          </div>
        )
      }
    />
  )
}

export function InboxDetail() {
  const now = useNow(30_000)
  const { items, unread, hydrated } = useInbox(now)
  if (hydrated && !items.length) return <Empty text="Inbox zero." />
  return (
    <Section title={unread ? `${unread} unread` : 'All read'} count={items.length}>
      {items.map((n, i) => {
        const isUnread = !n.read_at
        return (
          <motion.li
            key={n.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: isUnread ? 1 : 0.55, y: 0 }}
            transition={{ ...morph, delay: Math.min(i, 10) * 0.025 }}
            className="border-b border-line last:border-0"
          >
            <motion.button
              whileTap={press}
              onClick={() => void markNotificationRead(n.id)}
              className="flex w-full items-start gap-3 py-3 text-left"
            >
              <span
                className="mt-2 h-2 w-2 shrink-0 rounded-full transition-all duration-300"
                style={{
                  background: isUnread ? INBOX_ACCENT : 'transparent',
                  boxShadow: isUnread ? `0 0 10px ${INBOX_ACCENT}` : 'none',
                  border: isUnread ? 'none' : '1px solid rgb(255 255 255 / 0.2)',
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px] text-white">{n.title}</span>
                  <span className="num shrink-0 text-xs text-faint">{ago(n.sent_at ?? n.created_at, now)}</span>
                </span>
                {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span>}
              </span>
            </motion.button>
          </motion.li>
        )
      })}
    </Section>
  )
}
