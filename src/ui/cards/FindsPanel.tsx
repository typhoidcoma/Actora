import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { markSeen, unseenCount, useFinds, type Find } from '../../finds/finds'
import { ui, useUi } from '../../stores/ui'
import { morph } from '../motion'
import { Panel } from './Panel'
import { SelectedWash } from '../tiles/parts'
import { ROLE } from '../brand'
import { LazyMarkdown } from '../LazyMarkdown'

/** Box 4 expanded: today's fun finds as rich cards. Each counts as seen once it's actually looked at. */
export function FindsPanel() {
  const { items, status, seen, note } = useFinds()
  const unseen = unseenCount({ items, seen })
  const selected = useUi((s) => s.find)
  const kicker =
    status === 'hunting'
      ? 'Wendy is hunting for more…'
      : unseen
        ? `${unseen} new for you today`
        : 'All caught up for today'

  return (
    <Panel layoutId="finds-card" accent={ROLE.finds} kicker={kicker} title="For you" onClose={ui.closeFinds}>
      {/* Her own words about today's finds (the Markdown reply from the hunt). */}
      {note && status !== 'hunting' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={morph}
          className="mb-6 border-l-2 pl-4 text-[16px] text-text"
          style={{ borderColor: 'var(--role-finds)' }}
        >
          <LazyMarkdown text={note} />
        </motion.div>
      )}
      <ul className="grid gap-5 sm:grid-cols-2">
        {items.map((f, i) => (
          <FindItem key={f.id} find={f} index={i} selected={selected === f.id} isNew={!seen.includes(f.id)} />
        ))}
        {status === 'hunting' &&
          [0, 1].map((i) => <li key={`ghost-${i}`} className="shimmer aspect-[16/10] rounded-[6px] bg-text/6" />)}
      </ul>
    </Panel>
  )
}

function FindItem({
  find: f,
  index,
  selected,
  isNew,
}: {
  find: Find
  index: number
  selected: boolean
  isNew: boolean
}) {
  const ref = useRef<HTMLLIElement>(null)

  // Counts as seen once most of it has been on screen for a moment.
  useEffect(() => {
    const el = ref.current
    if (!el || !isNew) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer)
        if (entry.intersectionRatio >= 0.6) timer = setTimeout(() => markSeen(f.id), 900)
      },
      { threshold: [0, 0.6] },
    )
    io.observe(el)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [f.id, isNew])

  return (
    <motion.li
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...morph, delay: index * 0.05 }}
      className="relative isolate"
    >
      <SelectedWash on={selected} accent={ROLE.finds} />
      <button onClick={() => ui.selectFind(f.id)} className="block w-full text-left">
        {f.image && (
          <img
            src={f.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="mb-3 aspect-[16/10] w-full rounded-[6px] object-cover"
          />
        )}
        <div className="mb-1 flex items-baseline gap-2 text-[13px] font-bold">
          <span className="text-accent">{f.tag}</span>
          <span className="font-medium text-muted">{f.source}</span>
          {isNew && <span className="ml-auto text-[12px] font-bold text-accent">New</span>}
        </div>
        <div className="display text-[22px] leading-[1.05] font-bold tracking-[-0.03em] text-strong">{f.title}</div>
        {f.why && (
          <div
            className="mt-2 rounded-[6px] px-3 py-2"
            style={{ background: `color-mix(in srgb, ${ROLE.finds} 12%, transparent)` }}
          >
            <div className="text-[12px] font-bold text-accent">Wendy says</div>
            <div className="text-[14px] font-medium text-strong">{f.why}</div>
          </div>
        )}
        {f.blurb && <p className="mt-2 text-[15px] leading-relaxed text-text">{f.blurb}</p>}
      </button>
      <a
        href={f.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex h-10 items-center text-[14px] font-semibold text-accent underline decoration-accent/40 underline-offset-4"
      >
        Open on {f.source} ↗
      </a>
    </motion.li>
  )
}
