import { runOption } from '@actora/options/run'
import { useContextKey, useOptions } from '@actora/options/useOptions'
import { TextPanel } from './TextPanel'

const GAP = 0.06
const pillWidth = (label: string) => 0.16 + label.length * 0.034

/** The OptionRail as a row of pills at her feet; a tap runs the option exactly as in 2D. */
export function OptionPills3D() {
  const { options } = useOptions(useContextKey())
  const shown = options.slice(0, 4)
  const widths = shown.map((o) => pillWidth(o.label))
  const total = widths.reduce((a, b) => a + b, 0) + GAP * Math.max(0, shown.length - 1)

  let x = -total / 2
  return (
    <group position={[0, 0.38, 0.9]} rotation-x={-0.25}>
      {shown.map((o, i) => {
        const w = widths[i]
        const cx = x + w / 2
        x += w + GAP
        return (
          <TextPanel
            key={o.id}
            position={[cx, 0, 0]}
            width={w}
            height={0.13}
            body={o.label}
            bodySize={0.052}
            align="center"
            onPress={() => runOption(o)}
          />
        )
      })}
    </group>
  )
}
