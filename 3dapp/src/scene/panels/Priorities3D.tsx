import { ringing } from '@actora/aelora/protocol'
import type { RankedItem } from '@actora/stores/priority'
import { useEntities } from '@actora/stores/entities'
import { usePriorities } from '@actora/priority/usePriorities'
import { useNow } from '@actora/ui/tiles/data'
import type { Role } from '@actora/color/scheme'
import { usePresence } from '../../look/motion'
import { useLook } from '../../look/theme'
import { Glass } from './Glass'

const KIND: Record<RankedItem['kind'], { label: string; role: Role }> = {
  task: { label: 'Task', role: 'task' },
  event: { label: 'Event', role: 'event' },
  notification: { label: 'Reminder', role: 'reminder' },
  goal: { label: 'Goal', role: 'goal' },
}

/** Urgency heat, as in the 2D cards: calm, then mid, then urgent. */
const heat = (u: number): Role => (u >= 0.8 ? 'urgent' : u >= 0.5 ? 'mid' : 'calm')

/** The three priority cards, in an arc to her right; they slide when the order changes. */
export function Priorities3D() {
  const [list, done] = usePresence(usePriorities().slice(0, 3), (i) => i.key)
  return (
    <group position={[1.6, 1.5, 0.15]} rotation-y={-0.4}>
      {list.map((p) => (
        <Card key={p.key} item={p.item} index={p.index} present={p.present} onGone={() => done(p.key)} />
      ))}
    </group>
  )
}

function Card({ item, index, present, onGone }: { item: RankedItem; index: number; present: boolean; onGone: () => void }) {
  const look = useLook()
  const reminder = useEntities((s) => (item.kind === 'notification' ? s.notifications[item.id] : undefined))
  const now = useNow(15_000)
  const ring = !!reminder && ringing(reminder, now)
  const kind = KIND[item.kind]
  const tone = item.urgency >= 0.5 ? look.ink[heat(item.urgency)] : look.ink[kind.role]

  return (
    <Glass
      position={[0, -index * 0.5, 0]}
      width={1.3}
      height={0.44}
      kicker={ring ? `${kind.label} · now` : kind.label}
      kickerColor={ring ? look.ink.urgent : tone}
      title={item.title}
      body={item.meta}
      titleSize={0.074}
      bodySize={0.046}
      accent={look.role[kind.role]}
      glow={ring ? look.role.urgent : null}
      present={present}
      onGone={onGone}
      delay={index * 0.08}
    />
  )
}
