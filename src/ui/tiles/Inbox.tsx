import { motion } from 'motion/react'
import type { Notification } from '../../aelora/protocol'
import { ui } from '../../stores/ui'
import { AnimatedNumber } from '../AnimatedNumber'
import { ago } from '../format'
import { morph, press } from '../motion'
import { useInbox, useNow, useSelected } from './data'
import { Face, type Corner } from './Face'
import { Empty, Section, SelectedWash } from './parts'

export const INBOX_ACCENT = '#DEC484'

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
                className="h-[7px] w-[7px] rounded-full"
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
  if (hydrated && !items.length) return <Empty text="All quiet." />
  return (
    <Section title={unread ? `${unread} unread` : 'All read'} count={items.length}>
      {items.map((n, i) => (
        <NoteRow key={n.id} note={n} index={i} now={now} />
      ))}
    </Section>
  )
}

function NoteRow({ note: n, index, now }: { note: Notification; index: number; now: number }) {
  const isUnread = !n.read_at
  const selected = useSelected('notification', n.id)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isUnread ? 1 : 0.6, y: 0 }}
      transition={{ ...morph, delay: Math.min(index, 10) * 0.025 }}
      className="relative isolate border-b border-line last:border-0"
    >
      <SelectedWash on={selected} accent={INBOX_ACCENT} />
      <motion.button
        whileTap={press}
        onClick={() => ui.select({ kind: 'notification', id: n.id })}
        className="flex w-full items-start gap-3 py-3 text-left"
      >
        <span
          className="mt-2 h-2 w-2 shrink-0 rounded-full transition-all duration-300"
          style={{
            background: isUnread ? INBOX_ACCENT : 'transparent',
            boxShadow: isUnread ? 'none' : 'inset 0 0 0 1.5px var(--t-faint)',
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[16px] text-strong">{n.title}</span>
            <span className="num shrink-0 text-xs text-faint">{ago(n.sent_at ?? n.created_at, now)}</span>
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span>}
        </span>
      </motion.button>
    </motion.li>
  )
}
