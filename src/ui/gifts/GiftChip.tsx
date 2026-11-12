import { motion } from 'motion/react'
import { agentName } from '../../stores/agent'
import { gifts, useGifts } from '../../stores/gifts'
import { press } from '../motion'
import { GiftImage } from './GiftImage'

/** Her gift, under the reply she gave it in: the picture small, her note, tap to open it large. */
export function GiftChip({ id }: { id: string }) {
  const gift = useGifts((s) => s.items[id])
  const isNew = useGifts((s) => s.unseen.includes(id))
  // Removed since (or another account): nothing to show.
  if (!gift) return null
  return (
    <motion.button
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      whileTap={press}
      onClick={() => gifts.show(id)}
      aria-label={`Open the gift from ${agentName()}`}
      className="glass-pill mt-2 flex w-full max-w-[340px] items-center gap-3 rounded-[10px] p-2 pr-3 text-left"
    >
      <span className="relative shrink-0">
        <GiftImage gift={gift} className="block h-16 w-16 rounded-[8px]" />
        {isNew && <span aria-hidden className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent ring-2 ring-bg" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold tracking-wide text-accent">A gift from {agentName()}</span>
        <span className="line-clamp-2 text-[14px] text-strong">{gift.note || 'Tap to open it.'}</span>
      </span>
    </motion.button>
  )
}
