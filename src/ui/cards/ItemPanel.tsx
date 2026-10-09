import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEntities } from '../../stores/entities'
import { ui, type Selected } from '../../stores/ui'
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
  const seeAll = (
    <button
      onClick={() => ui.reveal(item)}
      className="h-10 text-[14px] font-medium text-muted underline decoration-line underline-offset-4"
    >
      See all {kind.list}
    </button>
  )

  let title = 'Not found'
  let body: ReactNode = <p className="text-muted">This item is gone — it may have been finished or removed.</p>

  if (item.kind === 'task' && e.tasks[item.id]) {
    const t = e.tasks[item.id]
    const goal = t.goal_id ? e.goals[t.goal_id] : null
    title = t.title
    body = (
      <Facts
        rows={[
          ['Status', t.status.replace('_', ' ')],
          ['Due', dueLabel(t.due_date) ?? 'No date'],
          t.estimated_minutes ? ['Estimate', `${t.estimated_minutes} min`] : null,
          goal ? ['Goal', goal.title] : null,
        ]}
      />
    )
  } else if (item.kind === 'event') {
    const ev = Object.values(e.events).find((x) => x.id === item.id)
    if (ev) {
      title = ev.title
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
      footer={seeAll}
    >
      {body}
    </Panel>
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
