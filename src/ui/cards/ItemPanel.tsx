import { useEffect, useState, type ReactNode } from 'react'
import { deleteItem } from '../../aelora/client'
import { useAgent } from '../../stores/agent'
import { useTaskBrief } from '../../tasks/brief'
import { usePriorities } from '../../priority/usePriorities'
import { clashes } from '../tiles/data'
import { linkParts } from '../markdownText'
import { useShallow } from 'zustand/react/shallow'
import { useEntities } from '../../stores/entities'
import { ui, useUi, type Selected } from '../../stores/ui'
import { ago, clockTime, dayLabel, dueLabel } from '../format'
import { KIND } from './kinds'
import { Panel } from './Panel'

/** One item, opened from its card (or by Wendy). Its actions are on the rail. */
export function ItemPanel({ item }: { item: Selected }) {
  const e = useEntities(
    useShallow((s) => ({ tasks: s.tasks, goals: s.goals, events: s.events, notifications: s.notifications })),
  )
  const kind = KIND[item.kind]
  const close = () => ui.leaveItem()
  // A task's "about": its notes, or (until it has some) a brief Wendy writes for it.
  const task = item.kind === 'task' ? (e.tasks[item.id] ?? null) : null
  const taskGoal = task?.goal_id ? (e.goals[task.goal_id]?.title ?? null) : null
  const brief = useTaskBrief(task, taskGoal, !!task?.notes?.trim())
  const botName = useAgent((s) => s.botName)
  // Why Wendy put this card where it is, in her words (when she ranked it).
  const ranked = usePriorities().find((p) => p.key === `${item.kind}:${item.id}`)
  const why = ranked?.whyFrom === 'wendy' ? ranked.why : null
  const seeAll = (
    <button
      onClick={() => ui.reveal(item)}
      className="h-10 text-[14px] font-medium text-muted underline decoration-line underline-offset-4"
    >
      See all {kind.list}
    </button>
  )

  let title = 'Not found'
  // Set when the item exists and can be deleted here (reminders can't be).
  let removable: { kind: 'task' | 'goal' | 'event'; occurrence?: string; guests?: boolean } | null = null
  let body: ReactNode = <p className="text-muted">This item is gone — it may have been finished or removed.</p>

  if (item.kind === 'task' && e.tasks[item.id]) {
    const t = e.tasks[item.id]
    removable = { kind: 'task' }
    const goal = t.goal_id ? e.goals[t.goal_id] : null
    title = t.title
    const notes = t.notes?.trim()
    body = (
      <>
        <About text={notes || brief.text} byWendy={!notes} loading={!notes && brief.loading} botName={botName} />
        <Facts
          rows={[
            ['Status', t.status.replace('_', ' ')],
            ['Due', dueLabel(t.due_date) ?? 'No date'],
            t.estimated_minutes ? ['Estimate', `${t.estimated_minutes} min`] : null,
            goal ? ['Goal', goal.title] : null,
          ]}
        />
      </>
    )
  } else if (item.kind === 'event') {
    // The tapped occurrence of a repeating event, not just the first one with this id.
    const all = Object.values(e.events).filter((x) => x.id === item.id)
    const ev = (item.occurrence && all.find((x) => x.occurrence_start === item.occurrence)) || all[0]
    const clashWith = ev ? clashes(Object.values(e.events)).get(`${ev.id}@${ev.occurrence_start ?? ''}`) : undefined
    if (ev) {
      title = ev.title
      removable = {
        kind: 'event',
        occurrence: ev.is_recurring ? (ev.occurrence_start ?? undefined) : undefined,
        guests: !!ev.has_guests,
      }
      body = (
        <>
          <Facts
            rows={[
              [
                'When',
                ev.all_day
                  ? `${dayLabel(ev.start_time)} · all day`
                  : `${dayLabel(ev.start_time)} · ${clockTime(ev.start_time)}–${clockTime(ev.end_time)}`,
              ],
              ev.location ? ['Where', ev.location] : null,
              ev.is_recurring ? ['Repeats', repeatLabel(ev.rrule)] : null,
              ev.has_guests ? ['Guests', 'Others are invited'] : null,
              clashWith ? ['Clashes with', clashWith] : null,
            ]}
          />
          {ev.description && <p className="mt-4 text-[15px] leading-relaxed text-text">{ev.description}</p>}
        </>
      )
    }
  } else if (item.kind === 'notification' && e.notifications[item.id]) {
    const n = e.notifications[item.id]
    title = n.title
    body = (
      <>
        {n.body && <p className="text-[17px] leading-relaxed text-text">{n.body}</p>}
        <Facts
          rows={[
            ['From', n.origin_type === 'wendy' ? 'Wendy' : n.origin_type],
            ['Sent', ago(n.sent_at ?? n.created_at)],
            ['Status', n.read_at ? 'Read' : 'Unread'],
          ]}
        />
      </>
    )
  } else if (item.kind === 'goal' && e.goals[item.id]) {
    const g = e.goals[item.id]
    removable = { kind: 'goal' }
    const linked = Object.values(e.tasks).filter((t) => t.goal_id === g.id && t.status !== 'skipped')
    const done = linked.filter((t) => t.status === 'done').length
    title = g.title
    body = (
      <>
        {g.description && <p className="mb-4 text-[15px] text-text">{g.description}</p>}
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-text/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${linked.length ? (done / linked.length) * 100 : 2}%`, background: kind.color }}
          />
        </div>
        <Facts
          rows={[
            ['Timeframe', g.timeframe ?? '—'],
            ['Progress', `${done} of ${linked.length} tasks`],
          ]}
        />
        {linked.length > 0 && (
          <ul className="mt-4">
            {linked.map((t) => (
              <li key={t.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => ui.open({ kind: 'task', id: t.id })}
                  className={`block w-full py-3 text-left text-[15px] ${t.status === 'done' ? 'text-muted line-through' : 'text-strong'}`}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <Panel
      layoutId={`card-${item.kind}:${item.id}`}
      accent={kind.color}
      kicker={kind.label}
      title={title}
      onClose={close}
      footer={
        <div className="flex items-center justify-between gap-3">
          {seeAll}
          {removable && (
            <DeleteButton
              key={`${item.kind}:${item.id}:${item.occurrence ?? ''}`}
              noun={kind.label.toLowerCase()}
              occurrence={removable.occurrence}
              guests={removable.guests}
              onDelete={(occurrence) => deleteItem(removable.kind, item.id, title, occurrence)}
            />
          )}
        </div>
      }
    >
      {why && (
        <p className="mb-4 border-l-2 pl-3 text-[15px] text-text" style={{ borderColor: kind.color }}>
          <span className="font-semibold text-strong">{botName}:</span> {why}
        </p>
      )}
      {body}
    </Panel>
  )
}

/**
 * Two taps, so nothing goes by accident: the first asks, the second deletes
 * (with an Undo toast after). A repeating event asks which: this occurrence or
 * the whole series. An event with guests says Google will email them, because
 * deleting it from here cancels it for everyone.
 */
function DeleteButton({
  noun,
  occurrence,
  guests,
  onDelete,
}: {
  noun: string
  occurrence?: string
  guests?: boolean
  onDelete: (occurrence?: string) => void
}) {
  const [tapped, setTapped] = useState(false)
  // "Delete…" from a list row or the rail opens the panel already asking.
  const deleting = useUi((s) => s.deleting)
  const asking = tapped || deleting
  // Left unanswered, the question quietly goes away (long enough to read the guest warning).
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => {
      setTapped(false)
      useUi.setState({ deleting: false })
    }, 8000)
    return () => clearTimeout(t)
  }, [asking])

  const run = (which?: string) => {
    ui.leaveItem() // it's gone at once; back to where the user came from
    onDelete(which)
  }

  const btn = 'h-11 rounded-[8px] px-3.5 text-[14px] font-semibold transition-colors'
  if (!asking) {
    return (
      <button onClick={() => setTapped(true)} className={`${btn} text-muted hover:text-urgent`}>
        {guests ? 'Cancel event' : 'Delete'}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {guests && <span className="text-[13px] text-urgent">Google will email the guests.</span>}
      {occurrence ? (
        <>
          <button onClick={() => run(occurrence)} className={`${btn} glass-pill text-urgent`}>
            Just this one
          </button>
          <button onClick={() => run()} className={`${btn} glass-pill text-urgent`}>
            Every one
          </button>
        </>
      ) : (
        <button onClick={() => run()} className={`${btn} bg-urgent text-white`}>
          {guests ? 'Cancel for everyone' : `Delete ${noun}`}
        </button>
      )}
    </div>
  )
}

/** What the task is about: its notes, or Wendy's brief (labelled as hers) while it has none. */
function About({
  text,
  byWendy,
  loading,
  botName,
}: {
  text: string | null
  byWendy: boolean
  loading: boolean
  botName: string
}) {
  if (!text && !loading) return null
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
        {byWendy ? `${botName}'s take` : 'About'}
      </h3>
      {text ? (
        <p className="selectable text-[16px] leading-relaxed whitespace-pre-line text-strong">
          <Linked text={text} />
        </p>
      ) : (
        <div className="space-y-2" aria-label={`${botName} is writing this up`}>
          <div className="shimmer h-3.5 w-full rounded bg-text/8" />
          <div className="shimmer h-3.5 w-4/5 rounded bg-text/8" />
        </div>
      )}
    </section>
  )
}

/** Text with its web links tappable (a saved find's notes carry its URL). */
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all text-accent underline decoration-accent/40 underline-offset-4"
          >
            {p.label}
          </a>
        ),
      )}
    </>
  )
}

/** "Weekly", "Every 2 weeks", "Daily"… from an RRULE; "Yes" when it's anything fancier. */
function repeatLabel(rrule?: string | null): string {
  const freq = /FREQ=(\w+)/.exec(rrule ?? '')?.[1]
  const n = Number(/INTERVAL=(\d+)/.exec(rrule ?? '')?.[1] ?? 1)
  const unit: Record<string, [string, string]> = {
    DAILY: ['Daily', 'days'],
    WEEKLY: ['Weekly', 'weeks'],
    MONTHLY: ['Monthly', 'months'],
    YEARLY: ['Yearly', 'years'],
  }
  if (!freq || !unit[freq]) return 'Yes'
  return n > 1 ? `Every ${n} ${unit[freq][1]}` : unit[freq][0]
}

function Facts({ rows }: { rows: Array<[string, string] | null> }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[15px]">
      {rows
        .filter((r): r is [string, string] => r !== null)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-strong">{v}</dd>
          </div>
        ))}
    </dl>
  )
}
