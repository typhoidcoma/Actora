import { useRef } from 'react'
import { runOption } from '@actora/options/run'
import type { Option } from '@actora/options/types'
import { useContextKey, useOptions } from '@actora/options/useOptions'
import { usePresence } from '../../look/motion'
import { useLook } from '../../look/theme'
import { Glass } from './Glass'

const GAP = 0.06
const pillWidth = (label: string) => 0.2 + label.length * 0.036

/** The OptionRail as glass pills at her feet; a tap runs the option exactly as in 2D. */
export function OptionPills3D() {
  const look = useLook()
  const { options } = useOptions(useContextKey())
  const shown = options.slice(0, 4)
  const [list, done] = usePresence(shown, (o) => o.id)

  // Lay out the current row; a pill on its way out keeps the spot it had.
  const spots = useRef(new Map<string, number>())
  const widths = shown.map((o) => pillWidth(o.label))
  const total = widths.reduce((a, b) => a + b, 0) + GAP * Math.max(0, shown.length - 1)
  let x = -total / 2
  shown.forEach((o, i) => {
    spots.current.set(o.id, x + widths[i] / 2)
    x += widths[i] + GAP
  })

  return (
    <group position={[0, 0.4, 0.95]} rotation-x={-0.22}>
      {list.map((p) => (
        <Pill
          key={p.key}
          option={p.item}
          x={spots.current.get(p.key) ?? 0}
          index={p.index}
          present={p.present}
          accent={p.item.source === 'agent' ? look.role.agent : look.role.accent}
          onGone={() => {
            spots.current.delete(p.key)
            done(p.key)
          }}
        />
      ))}
    </group>
  )
}

function Pill(p: { option: Option; x: number; index: number; present: boolean; accent: string; onGone: () => void }) {
  return (
    <Glass
      position={[p.x, 0, 0]}
      width={pillWidth(p.option.label)}
      height={0.14}
      body={p.option.label}
      bodySize={0.054}
      align="center"
      accent={p.accent}
      present={p.present}
      onGone={p.onGone}
      delay={p.index * 0.05}
      onPress={() => runOption(p.option)}
    />
  )
}
