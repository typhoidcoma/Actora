import { usePriorities } from '@actora/priority/usePriorities'
import { TextPanel } from './TextPanel'

/** Urgency 0–1 as calm violet through amber to red, like the 2D cards. */
function urgencyTone(u: number): string {
  return u > 0.75 ? '#ff6b6b' : u > 0.45 ? '#ffb454' : '#8f86ff'
}

/** The three priority cards, in an arc to her right. */
export function Priorities3D() {
  const items = usePriorities().slice(0, 3)
  return (
    <group position={[1.55, 1.45, 0.2]} rotation-y={-0.38}>
      {items.map((item, i) => (
        <TextPanel
          key={item.key}
          position={[0, -i * 0.5, 0]}
          width={1.25}
          height={0.44}
          kicker={item.meta}
          title={item.title}
          body={item.why}
          titleSize={0.06}
          bodySize={0.045}
          tone={urgencyTone(item.urgency)}
        />
      ))}
    </group>
  )
}
