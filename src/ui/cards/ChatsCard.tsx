import type { ChatRow, ChatsCardData } from '../../stores/social'
import { useMetrics } from '../../stores/metrics'
import { ui } from '../../stores/ui'
import { ROLE } from '../brand'
import { ago } from '../format'
import { AssistantAvatar, Avatar, StackedAvatars } from '../people/bits'
import { useNow } from '../tiles/data'
import type { Corner } from '../tiles/Face'
import { CardShell } from './CardShell'
import { urgencyColor } from './kinds'

/**
 * Chats on the home grid, always: the user's conversations (friends, groups,
 * assistants), waiting ones first, so it's clear where chat lives and when
 * something's going on. Who and when only, never what was said (anyone can see
 * the screen). A row opens that conversation; the rest of the card opens People.
 */
export function ChatsCard({ card, corner, hidden }: { card: ChatsCardData; corner: Corner; hidden: boolean }) {
  const now = useNow(30_000) // keeps "3m ago" current
  const stack = useMetrics((m) => m.stack)
  // How tall this card is, to fit as many rows as it has room for.
  const cell = useMetrics((m) => (m.stack ? m.cellH : (m.gridH - m.gap) / 2))
  const notch = useMetrics((m) => (m.stack ? 0 : m.orb / 2 + m.gap))
  const rowH = Math.round(Math.min(40, Math.max(28, cell * 0.16)))
  const pad = stack ? 10 : Math.max(12, Math.round(cell * 0.06))
  const headH = stack ? 22 : Math.round(Math.min(30, Math.max(22, cell * 0.12)))
  // Leave the orb's notch clear (the inner corner, at the bottom on the top row).
  const reserve = corner === 0 || corner === 1 ? notch * 0.55 : 0
  const fit = Math.max(1, Math.floor((cell - pad * 2 - headH - reserve) / rowH))
  const rows = card.rows.slice(0, fit)
  const right = corner === 1 || corner === 3

  const urgency = card.score / 100
  const warmth = Math.round(Math.max(0, urgency - 0.4) * 110)
  const glow = `color-mix(in srgb, ${urgencyColor(urgency)} ${warmth}%, ${ROLE.status.ok})`
  const labelTint = card.unread
    ? `color-mix(in srgb, ${urgencyColor(urgency)} ${Math.max(35, warmth)}%, var(--t-text))`
    : 'var(--t-muted)'
  const status = card.unread ? `${card.unread} new` : card.rows.length ? 'All caught up' : ''

  return (
    <CardShell
      layoutId="card-chats"
      corner={corner}
      accent={glow}
      hidden={hidden}
      label={`Chats${status ? `, ${status}` : ''}: open People`}
      onOpen={() => ui.openPeople()}
    >
      <div className="flex h-full flex-col" style={{ padding: pad, paddingBottom: pad + reserve }}>
        <div
          className={`flex shrink-0 items-baseline justify-between gap-2 ${right ? 'flex-row-reverse' : ''}`}
          style={{ height: headH }}
        >
          <span
            className="truncate pl-0.5 font-bold"
            style={{ fontSize: 'clamp(15px, calc(var(--grid) * 0.034), 20px)', color: labelTint }}
          >
            Chats
          </span>
          {status && (
            <span
              className="num shrink-0 text-[max(12px,calc(var(--grid)*0.025))] font-semibold"
              style={{ color: card.unread ? labelTint : 'var(--t-muted)' }}
            >
              {status}
            </span>
          )}
        </div>
        {rows.length ? (
          <ul className="min-w-0">
            {rows.map((r) => (
              <Row key={r.threadId} row={r} height={rowH} now={now} />
            ))}
          </ul>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <div className="text-[max(15px,calc(var(--grid)*0.034))] font-semibold text-strong">No chats yet</div>
            <div className="mt-1 text-[max(12px,calc(var(--grid)*0.025))] text-muted">
              Tap to add a friend or start a group
            </div>
          </div>
        )}
      </div>
    </CardShell>
  )
}

function Row({ row, height, now }: { row: ChatRow; height: number; now: number }) {
  const face = Math.round(height * 0.72)
  const when = row.at ? ago(row.at, now) : ''
  return (
    <li>
      <button
        type="button"
        onClick={(e) => {
          // Straight to this conversation, not the People list.
          e.stopPropagation()
          ui.openPeople(row.threadId)
        }}
        aria-label={`${row.name}${row.unread ? `, ${row.unread} new` : ''}${when ? `, ${when}` : ''}`}
        className="-mx-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center gap-2 rounded-[8px] px-1 text-left transition-colors hover:bg-text/6 active:bg-text/10"
        style={{ height }}
      >
        {row.kind === 'group' ? (
          <StackedAvatars who={row.faces} size={face} />
        ) : row.theirAssistant ? (
          <AssistantAvatar size={face} />
        ) : (
          <Avatar who={row.faces[0] ?? null} size={face} />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-[max(13px,calc(var(--grid)*0.03))] ${row.unread ? 'font-bold text-strong' : 'font-medium text-muted'}`}
        >
          {row.name}
        </span>
        {row.unread ? (
          <span
            // A tint, not a solid dot, so the count reads in day and dusk alike.
            className="num grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[12px] font-bold text-strong"
            style={{ background: `color-mix(in srgb, ${ROLE.status.ok} 30%, transparent)` }}
          >
            {row.unread > 99 ? '99+' : row.unread}
          </span>
        ) : (
          when && <span className="num shrink-0 text-[12px] text-muted">{when}</span>
        )}
      </button>
    </li>
  )
}
