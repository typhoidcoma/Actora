import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createGroup } from '../../social/social'
import type { Profile } from '../../social/types'
import { nameOf, useSocial } from '../../stores/social'
import { press } from '../motion'
import { Avatar } from './bits'

/** Your friends you could add (blocked people never are): tap to pick, tap again to unpick. */
export function FriendPicker({
  picked,
  onToggle,
  leaveOut = [],
}: {
  picked: Set<string>
  onToggle: (userId: string) => void
  /** Already in the group. */
  leaveOut?: string[]
}) {
  const { friends, blocks } = useSocial()
  const list = friends
    .filter((f) => f.status === 'accepted')
    .map((f) => f.profile)
    .filter((p) => !leaveOut.includes(p.userId) && !blocks.some((b) => b.userId === p.userId))
  if (!list.length) return <p className="py-2 text-[15px] text-muted">No other friends to add.</p>
  return (
    <ul>
      {list.map((p) => {
        const on = picked.has(p.userId)
        return (
          <li key={p.userId} className="border-b border-line last:border-0">
            <button
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(p.userId)}
              className="flex w-full min-w-0 items-center gap-3 py-2.5 text-left"
            >
              <Avatar who={p} />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-strong">{nameOf(p)}</span>
              <Tick on={on} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${on ? 'bg-fill text-on-accent' : 'bg-text/10'}`}
    >
      {on && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}

/** A first name, for a group's default title. */
const firstName = (p: Profile) => nameOf(p).replace(/^@/, '').split(/\s+/)[0] ?? ''

/** Pick friends, and a name that's filled in from them (so nothing has to be typed). */
export function NewGroup() {
  const friends = useSocial((s) => s.friends)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A refusal comes back as a toast: the button is usable again shortly after.
  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => setBusy(false), 5000)
    return () => clearTimeout(t)
  }, [busy])

  const names = friends
    .filter((f) => picked.has(f.profile.userId))
    .map((f) => firstName(f.profile))
    .filter(Boolean)
  const auto = (names.length ? `You, ${names.join(', ')}` : '').slice(0, 80)
  const name = title ?? auto

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <form
      className="grid max-w-[520px] grid-cols-[minmax(0,1fr)] gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        // People opens the group when it comes back; a refusal is a toast.
        if (createGroup(name, [...picked])) setBusy(true)
      }}
    >
      <section>
        <h3 className="label mb-2 text-muted">Name</h3>
        <input
          name="group-title"
          value={name}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Pick friends, or name it"
          aria-label="Group name"
          className="glass-pill h-11 w-full rounded-[8px] px-3 text-[16px] text-strong outline-none placeholder:text-faint"
        />
      </section>
      <section>
        <h3 className="label mb-1 text-muted">Friends</h3>
        <FriendPicker picked={picked} onToggle={toggle} />
      </section>
      <motion.button
        whileTap={press}
        type="submit"
        disabled={!picked.size || !name.trim() || busy}
        className="h-12 rounded-[8px] bg-fill px-4 text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
      >
        {busy ? 'Making it…' : picked.size ? `Start group with ${picked.size}` : 'Pick at least one friend'}
      </motion.button>
    </form>
  )
}
