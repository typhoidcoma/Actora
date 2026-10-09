import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import type { ComponentType } from 'react'
import { useMetrics } from '../stores/metrics'
import { TILE_IDS, ui, useUi, type TileId } from '../stores/ui'
import { glide, jelly, morph, press } from './motion'
import { sheen } from './sheen'
import { CALENDAR_ACCENT, CalendarDetail, CalendarFace } from './tiles/Calendar'
import type { Corner } from './tiles/Face'
import { GOALS_ACCENT, GoalsDetail, GoalsFace } from './tiles/Goals'
import { INBOX_ACCENT, InboxDetail, InboxFace } from './tiles/Inbox'
import { TASKS_ACCENT, TasksDetail, TasksFace } from './tiles/Tasks'

interface TileDef {
  label: string
  accent: string
  Face: ComponentType<{ corner: Corner }>
  Detail: ComponentType
}

const TILES: Record<TileId, TileDef> = {
  tasks: { label: 'Tasks', accent: TASKS_ACCENT, Face: TasksFace, Detail: TasksDetail },
  goals: { label: 'Goals', accent: GOALS_ACCENT, Face: GoalsFace, Detail: GoalsDetail },
  calendar: { label: 'Calendar', accent: CALENDAR_ACCENT, Face: CalendarFace, Detail: CalendarDetail },
  inbox: { label: 'Inbox', accent: INBOX_ACCENT, Face: InboxFace, Detail: InboxDetail },
}

// The notch sits in each tile's inner corner, i.e. toward the grid centre.
const NOTCH = ['notch-br', 'notch-bl', 'notch-tr', 'notch-tl'] as const
const GLOW_AT = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'] as const

export function Grid() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus)
  const chatOpen = useUi((s) => s.chatOpen)

  return (
    <motion.div
      className="fixed"
      style={{ left: m.gridX, top: m.gridY, width: m.gridW, height: m.gridH }}
      animate={{ scale: chatOpen ? 0.94 : 1, opacity: chatOpen ? 0.3 : 1 }}
      transition={glide}
    >
      <div className="grid h-full w-full grid-cols-2 grid-rows-2" style={{ gap: m.gap }}>
        {TILE_IDS.map((id, i) =>
          focus === id ? (
            <div key={id} />
          ) : (
            <CollapsedTile key={id} id={id} corner={i as Corner} hidden={focus !== null} />
          ),
        )}
      </div>
      <AnimatePresence>{focus && <ExpandedTile key={focus} id={focus} />}</AnimatePresence>
    </motion.div>
  )
}

function Glow({ accent, at, strength = 0.16 }: { accent: string; at: string; strength?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background: `radial-gradient(120% 120% at ${at}, color-mix(in srgb, ${accent} ${strength * 100}%, transparent), transparent 60%)`,
      }}
    />
  )
}

function CollapsedTile({ id, corner, hidden }: { id: TileId; corner: Corner; hidden: boolean }) {
  const radius = useMetrics((s) => s.radius)
  const { Face, accent, label } = TILES[id]
  return (
    <motion.button
      layoutId={`tile-${id}`}
      aria-label={`Open ${label}`}
      onClick={() => ui.focus(id)}
      whileTap={jelly}
      {...sheen}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ ...morph, scale: jelly.transition }}
      className={`glass ${NOTCH[corner]} relative overflow-hidden text-left`}
      style={{ borderRadius: radius }}
    >
      <Glow accent={accent} at={GLOW_AT[corner]} />
      <motion.div layout="position" className="h-full w-full">
        <Face corner={corner} />
      </motion.div>
    </motion.button>
  )
}

function ExpandedTile({ id }: { id: TileId }) {
  const radius = useMetrics((s) => s.radius)
  const { Detail, accent, label } = TILES[id]
  const drag = useDragControls()

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) ui.focus(null)
  }

  return (
    <motion.div
      layoutId={`tile-${id}`}
      transition={morph}
      drag="y"
      dragListener={false}
      dragControls={drag}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.45 }}
      onDragEnd={onDragEnd}
      {...sheen}
      className="glass absolute inset-0 z-10 flex flex-col overflow-hidden"
      style={{ borderRadius: radius }}
    >
      <Glow accent={accent} at="0% 0%" strength={0.12} />
      <motion.header
        layout="position"
        onPointerDown={(e) => drag.start(e)}
        className="flex shrink-0 touch-none items-center justify-between gap-4 px-6 pt-5 pb-3"
      >
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 rotate-45 rounded-[2px]"
            style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
          />
          <h2 className="text-2xl font-medium tracking-tight text-white">{label}</h2>
        </div>
        <motion.button
          whileTap={press}
          onClick={() => ui.focus(null)}
          aria-label="Close"
          className="glass-pill grid h-11 w-11 place-items-center rounded-full text-text/80"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </motion.button>
      </motion.header>
      <motion.div
        className="scroll-y min-h-0 flex-1 px-6 pb-6"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0, transition: { ...morph, delay: 0.1 } }}
        exit={{ opacity: 0, transition: { duration: 0.08 } }}
      >
        <Detail />
      </motion.div>
    </motion.div>
  )
}
