import { useRef } from 'react'
import { runOption } from '@actora/options/run'
import type { Option } from '@actora/options/types'
import { useContextKey, useOptions } from '@actora/options/useOptions'
import { useFocused } from '../../look/focus'
import { CHIP_H, useStage } from '../../look/layout'
import { font, px, textWidth } from '../../look/paint'
import { usePresence } from '../../look/motion'
import { Anchor } from '../Anchor'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const GAP = 0.03
const SIZE = 0.042
const chipWidth = (label: string) => textWidth(label, font(500, SIZE)) / px(1) + 0.09
/** Room kept at the end of the first row for the chat and menu buttons (DOM, see Overlay). */
const BUTTONS = 0.3

/** The OptionRail: compact glass chips under the grid, wrapping to a second row like 2D. */
export function OptionPills3D() {
  const stage = useStage()
  const focused = useFocused()
  const { options } = useOptions(useContextKey())
  // Phones: two rows at most (the chat and menu buttons share the first).
  const shown = options.slice(0, stage.portrait ? 3 : 8)
  const [list, done] = usePresence(shown, (o) => o.id)

  // Rows of chips, each centred; a chip on its way out keeps the spot it had.
  const spots = useRef(new Map<string, [number, number]>())
  const rows: Option[][] = [[]]
  let used = 0
  for (const o of shown) {
    const w = chipWidth(o.label)
    if (used + w > stage.chips.w - (rows.length === 1 ? BUTTONS : 0) && rows[rows.length - 1].length) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1].push(o)
    used += w + GAP
  }
  let firstEnd = 0
  rows.forEach((row, r) => {
    const total = row.reduce((s, o) => s + chipWidth(o.label), 0) + GAP * (row.length - 1) + (r === 0 ? BUTTONS : 0)
    let x = -total / 2
    for (const o of row) {
      const w = chipWidth(o.label)
      spots.current.set(o.id, [x + w / 2, -r * (CHIP_H + GAP)])
      x += w + GAP
    }
    if (r === 0) firstEnd = row.length ? x : -total / 2
  })

  return (
    <group position={stage.chips.position} rotation={stage.chips.rotation} scale={stage.chips.scale}>
      <Anchor name="rail-end" position={[firstEnd + 0.01, 0, 0]} />
      {list.map((p) => (
        <Chip
          key={p.key}
          option={p.item}
          spot={spots.current.get(p.key) ?? [0, 0]}
          index={p.index}
          present={p.present && !focused}
          onGone={() => {
            spots.current.delete(p.key)
            done(p.key)
          }}
        />
      ))}
    </group>
  )
}

function Chip(p: { option: Option; spot: [number, number]; index: number; present: boolean; onGone: () => void }) {
  const look = useLook()
  const w = chipWidth(p.option.label)
  return (
    <Pane
      width={w}
      height={CHIP_H}
      radius={0.022}
      position={[p.spot[0], p.spot[1], 0]}
      paint={(ctx, cw, ch) => {
        ctx.beginPath()
        ctx.roundRect(1, 1, cw - 2, ch - 2, px(0.022))
        ctx.lineWidth = 2
        ctx.strokeStyle = look.line
        ctx.stroke()
        ctx.font = font(500, SIZE)
        ctx.fillStyle = look.strong
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.option.label, cw / 2, ch / 2 + 1)
      }}
      deps={[p.option.label]}
      present={p.present}
      onGone={p.onGone}
      delay={0.25 + p.index * 0.04}
      onPress={() => runOption(p.option)}
    />
  )
}
