import { useEffect, useState, type ReactNode } from 'react'
import { deleteItem } from '../../aelora/client'
import { agent, useAgent } from '../../stores/agent'
import { useTaskBrief } from '../../tasks/brief'
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
  const close = () => ui.select(null)
  // A task's "about": its notes, or (until it has some) a brief Wendy writes for it.
  const task = item.kind === 'task' ? (e.tasks[item.id] ?? null) : null
  const taskGoal = task?.goal_id ? (e.goals[task.goal_id]?.title ?? null) : null
  const brief = useTaskBrief(task, taskGoal, !!task?.notes?.trim())
  const botName = useAgent((s) => s.botName)
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
  let removable: { kind: 'task' | 'goal' | 'event'; occurrence?: string } | null = null
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
    const ev = Object.values(e.events).find((x) => x.id === item.id)
    if (ev) {
      title = ev.title
      removable = { kind: 'event', occurrence: ev.is_recurring ? (ev.occurrence_start ?? undefined) : undefined }
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
              ev.is_recurring ? ['Repeats', 'Yes'] : null,
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
              <li
                key={t.id}
                className={`border-b border-line py-2.5 text-[15px] last:border-0 ${t.status === 'done' ? 'text-faint line-through' : 'text-strong'}`}
              >
                {t.title}
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
              key={`${item.kind}:${item.id}`}
              title={title}
              noun={kind.label.toLowerCase()}
              occurrence={removable.occurrence}
              onDelete={(occurrence) => deleteItem(removable.kind, item.id, occurrence)}
            />
          )}
        </div>
      }
    >
      {body}
    </Panel>
  )
}

/**
 * Two taps, so nothing goes by accident: the first asks, the second deletes. A
 * repeating event asks which: just this occurrence, or the whole series.
 */
function DeleteButton({
  title,
  noun,
  occurrence,
  onDelete,
}: {
  title: string
  noun: string
  occurrence?: string
  onDelete: (occurrence?: string) => Promise<boolean>
}) {
  const [tapped, setTapped] = useState(false)
  // "Delete…" from a list row or the rail opens the panel already asking.
  const deleting = useUi((s) => s.deleting)
  const asking = tapped || deleting
  const setAsking = (v: boolean) => {
    setTapped(v)
    if (!v) useUi.setState({ deleting: false })
  }
  // Left unanswered, the question quietly goes away.
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => {
      setTapped(false)
      useUi.setState({ deleting: false })
    }, 5000)
    return () => clearTimeout(t)
  }, [asking])

  const run = async (which?: string) => {
    ui.select(null) // it's gone at once, and the panel closes with it
    const ok = await onDelete(which)
    agent.showMessage(ok ? `Deleted "${title}".` : `Couldn't delete "${title}", so it's back. Try again in a moment.`)
  }

  const btn = 'h-10 rounded-[8px] px-3.5 text-[14px] font-semibold transition-colors'
  if (!asking) {
    return (
      <button onClick={() => setAsking(true)} className={`${btn} text-muted hover:text-urgent`}>
        Delete
      </button>
    )
  }
  if (occurrence) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => void run(occurrence)} className={`${btn} glass-pill text-urgent`}>
          Just this one
        </button>
        <button onClick={() => void run()} className={`${btn} glass-pill text-urgent`}>
          Every one
        </button>
      </div>
    )
  }
  return (
    <button onClick={() => void run()} className={`${btn} bg-urgent text-white`}>
      Delete {noun}
    </button>
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
        <p className="selectable text-[16px] leading-relaxed text-strong">{text}</p>
      ) : (
        <div className="space-y-2" aria-label={`${botName} is writing this up`}>
          <div className="shimmer h-3.5 w-full rounded bg-text/8" />
          <div className="shimmer h-3.5 w-4/5 rounded bg-text/8" />
        </div>
      )}
    </section>
  )
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
