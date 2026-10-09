import { motion } from 'motion/react'
import type { CalendarOccurrence } from '../../aelora/protocol'
import { ui } from '../../stores/ui'
import { AnimatedNumber } from '../AnimatedNumber'
import { clockTime, countdownParts, dayLabel, until } from '../format'
import { morph } from '../motion'
import { useAgenda, useNow, useSelected } from './data'
import { Face, type Corner } from './Face'
import { Empty, Section, SelectedWash } from './parts'

export const CALENDAR_ACCENT = '#577E89'

export function CalendarFace({ corner }: { corner: Corner }) {
  const now = useNow(15_000)
  const { upcoming, current } = useAgenda(now)
  const next = upcoming.find((e) => e !== current && Date.parse(e.start_time) > now)

  if (current) {
    return (
      <Face
        corner={corner}
        accent={CALENDAR_ACCENT}
        label="Now"
        value={<span className="num">{clockTime(current.end_time)}</span>}
        unit="ends"
        line={current.title}
      />
    )
  }
  if (!next) {
    return <Face corner={corner} accent={CALENDAR_ACCENT} label="Calendar" value="Free" line="Nothing scheduled" />
  }
  const { value, unit } = countdownParts(Date.parse(next.start_time) - now)
  return (
    <Face
      corner={corner}
      accent={CALENDAR_ACCENT}
      label="Next up"
      value={<AnimatedNumber value={value} decimals={unit === 'hr' && value % 1 ? 1 : 0} />}
      unit={unit}
      line={`${next.title} · ${clockTime(next.start_time)}`}
    />
  )
}

export function CalendarDetail() {
  const now = useNow(15_000)
  const { upcoming, hydrated } = useAgenda(now)
  if (hydrated && !upcoming.length) return <Empty text="Your next two weeks are open." />

  const groups = new Map<string, CalendarOccurrence[]>()
  for (const e of upcoming) {
    const key = dayLabel(e.occurrence_start ?? e.start_time)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return (
    <>
      {[...groups].map(([day, events]) => (
        <Section key={day} title={day} count={events.length}>
          {events.map((e, i) => (
            <EventRow key={`${e.id}@${e.occurrence_start ?? ''}`} event={e} index={i} now={now} />
          ))}
        </Section>
      ))}
    </>
  )
}

function EventRow({ event: e, index, now }: { event: CalendarOccurrence; index: number; now: number }) {
  const start = Date.parse(e.start_time)
  const live = start <= now
  const selected = useSelected('event', e.id)
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...morph, delay: 0.03 * index }}
      className="relative isolate border-b border-line last:border-0"
    >
      <SelectedWash on={selected} accent={CALENDAR_ACCENT} />
      <button
        onClick={() => ui.select({ kind: 'event', id: e.id })}
        className="flex w-full items-stretch gap-3 py-3 text-left"
      >
        <span
          className="w-[3px] shrink-0 rounded-full"
          style={{ background: e.color || CALENDAR_ACCENT, opacity: live ? 1 : 0.6 }}
        />
        <span className="num w-[4.5rem] shrink-0 text-sm text-muted">
          {e.all_day ? 'All day' : clockTime(e.start_time)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] text-strong">{e.title}</span>
          {e.location && <span className="block truncate text-sm text-muted">{e.location}</span>}
        </span>
        <span className={`num shrink-0 self-center text-xs ${live ? 'font-medium text-apricot' : 'text-faint'}`}>
          {live ? 'now' : until(start - now)}
        </span>
      </button>
    </motion.li>
  )
}
