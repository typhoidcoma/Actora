import { motion } from 'motion/react'
import type { Notification } from '../../aelora/protocol'
import { ui } from '../../stores/ui'
import { AnimatedNumber } from '../AnimatedNumber'
import { ago, clockTime } from '../format'
import { say } from '../../options/run'
import { agentName } from '../../stores/agent'
import { toast } from '../../stores/toast'
import { morph, press } from '../motion'
import { useInbox, useNow, useSelected } from './data'
import { Face, type Corner } from './Face'
import { Empty, LoadFailed, Loading, Section, SelectedWash } from './parts'
import { ROLE } from '../brand'

export const INBOX_ACCENT = ROLE.kind.notification

export function InboxFace({ corner }: { corner: Corner }) {
  const now = useNow(30_000)
  const { items, unread, hydrated, failed } = useInbox(now)
  const latest = items.find((n) => !n.read_at) ?? items[0]
  if (!hydrated) return <Face corner={corner} accent={INBOX_ACCENT} label="Inbox" value="—" line="Loading…" />
  if (failed) return <Face corner={corner} accent={INBOX_ACCENT} label="Inbox" value="—" line="Couldn't load" />
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
  const { items, unread, upcoming, hydrated, failed } = useInbox(now)
  if (!hydrated) return <Loading />
  if (failed) return <LoadFailed kind="notifications" />
  if (!items.length && !upcoming.length) return <Empty text="All quiet." />
  return (
    <>
      {/* Reminders already set for later: so "remind me in an hour" visibly exists. */}
      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.map((n, i) => (
            <UpcomingRow key={n.id} note={n} index={i} now={now} />
          ))}
        </Section>
      )}
      {items.length > 0 && (
        <Section title={unread ? `${unread} unread` : 'All read'} count={items.length}>
          {items.map((n, i) => (
            <NoteRow key={n.id} note={n} index={i} now={now} />
          ))}
        </Section>
      )}
    </>
  )
}

/** A reminder set for later: when it'll come, and a way to call it off (the agent cancels it). */
function UpcomingRow({ note: n, index, now }: { note: Notification; index: number; now: number }) {
  const at = new Date(n.scheduled_for!)
  const when = `${at.toDateString() === new Date(now).toDateString() ? '' : `${at.toLocaleDateString([], { weekday: 'short' })} `}${clockTime(n.scheduled_for!)}`
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...morph, delay: Math.min(index, 10) * 0.025 }}
      className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
    >
      <span className="num w-[4.5rem] shrink-0 text-sm text-muted">{when}</span>
      <span className="min-w-0 flex-1 truncate text-[16px] text-strong">{n.title}</span>
      <button
        onClick={() => {
          // She's mid-answer: say so rather than a tap that does nothing.
          if (!say(`Cancel my reminder "${n.title}".`)) toast.show(`After ${agentName()} answers.`)
        }}
        className="h-11 shrink-0 rounded-[6px] px-3 text-[13px] font-semibold text-muted hover:text-urgent"
      >
        Cancel
      </button>
    </motion.li>
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
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`truncate text-[16px] text-strong ${isUnread ? 'font-bold' : ''}`}>{n.title}</span>
            <span className="num shrink-0 text-xs text-faint">{ago(n.sent_at ?? n.created_at, now)}</span>
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span>}
        </span>
      </motion.button>
    </motion.li>
  )
}
