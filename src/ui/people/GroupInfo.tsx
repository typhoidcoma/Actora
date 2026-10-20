import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import {
  addToGroup,
  leaveGroup,
  muteThread,
  removeFromGroup,
  renameGroup,
  setGroupRole,
  setMyAgent,
} from '../../social/social'
import type { Member, Thread } from '../../social/types'
import { nameOf, useSocial } from '../../stores/social'
import { press } from '../motion'
import { Avatar, Confirm } from './bits'
import { FriendPicker } from './NewGroup'
import { Switch } from './Switch'

const ROLE_NOTE: Record<string, string> = { owner: 'Owner', admin: 'Admin' }

/**
 * A group's name, who's in it, and what you can change. The controls follow your
 * role: the owner and admins add, remove and rename; only the owner sets roles.
 * Anyone can bring their assistant, mute or leave.
 */
export function GroupInfo({ thread: t }: { thread: Thread }) {
  const profile = useSocial((s) => s.profile)
  const manage = t.role === 'owner' || t.role === 'admin'
  const [name, setName] = useState(t.title ?? '')
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const assistantOn = profile?.assistantMode === 'friends'
  // Coming from the messages (kept scrolled to the newest): start at the top, with the name and people.
  const top = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = top.current?.closest('.scroll-y')
    if (box) box.scrollTop = 0
  }, [])

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // An admin can remove members, not other admins or the owner.
  const canRemove = (m: Member) => t.role === 'owner' || (t.role === 'admin' && m.role === 'member')

  return (
    <div ref={top} className="grid max-w-[520px] grid-cols-[minmax(0,1fr)] gap-6">
      {manage && (
        <section>
          <h3 className="label mb-2 text-muted">Name</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              renameGroup(t.id, name)
            }}
          >
            <input
              name="group-title"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label="Group name"
              className="glass-pill h-11 min-w-0 flex-1 rounded-[8px] px-3 text-[16px] text-strong outline-none"
            />
            <motion.button
              whileTap={press}
              type="submit"
              disabled={!name.trim() || name.trim() === (t.title ?? '').trim()}
              className="h-11 shrink-0 rounded-[8px] bg-fill px-4 text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
            >
              Save
            </motion.button>
          </form>
        </section>
      )}

      <section>
        <h3 className="label mb-1 text-muted">{t.members.length + 1} people</h3>
        <ul>
          {profile && (
            <MemberRow
              who={profile}
              name="You"
              note={[ROLE_NOTE[t.role ?? ''], t.agentPresent ? 'your assistant is here' : '']
                .filter(Boolean)
                .join(' · ')}
            />
          )}
          {t.members.map((m) => (
            <MemberRow
              key={m.userId}
              who={m}
              note={[ROLE_NOTE[m.role], m.agentPresent ? 'their assistant is here' : ''].filter(Boolean).join(' · ')}
            >
              {t.role === 'owner' && m.role !== 'owner' && (
                <button
                  onClick={() => setGroupRole(t.id, m.userId, m.role === 'admin' ? 'member' : 'admin')}
                  className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
                >
                  {m.role === 'admin' ? 'Make member' : 'Make admin'}
                </button>
              )}
              {canRemove(m) && (
                <Confirm label="Remove" ask="Remove?" onConfirm={() => void removeFromGroup(t.id, m.userId)} />
              )}
            </MemberRow>
          ))}
        </ul>
        {manage &&
          (adding ? (
            <div className="mt-3">
              <FriendPicker picked={picked} onToggle={toggle} leaveOut={t.members.map((m) => m.userId)} />
              <div className="mt-3 flex gap-2">
                <motion.button
                  whileTap={press}
                  disabled={!picked.size}
                  onClick={() => {
                    addToGroup(t.id, [...picked])
                    setPicked(new Set())
                    setAdding(false)
                  }}
                  className="h-10 rounded-[8px] bg-fill px-4 text-[14px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
                >
                  {picked.size ? `Add ${picked.size}` : 'Add'}
                </motion.button>
                <button
                  onClick={() => {
                    setPicked(new Set())
                    setAdding(false)
                  }}
                  className="glass-pill h-10 rounded-[8px] px-4 text-[14px] font-semibold text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <motion.button
              whileTap={press}
              onClick={() => setAdding(true)}
              className="glass-pill mt-3 h-10 rounded-[8px] px-4 text-[14px] font-semibold text-strong"
            >
              Add people
            </motion.button>
          ))}
      </section>

      <section>
        <Switch
          label="Bring my assistant"
          hint={
            assistantOn || t.agentPresent
              ? "Anyone here can ask her something. She shares only what you've chosen for friends."
              : 'Turn on your assistant for friends first (your profile).'
          }
          on={!!t.agentPresent}
          onChange={(v) => void setMyAgent(t.id, v)}
        />
        <Switch
          label="Mute"
          hint="No sound, badge or push for this group."
          on={t.muted}
          onChange={(v) => void muteThread(t.id, v)}
        />
      </section>

      <div>
        <Confirm label="Leave group" ask="Leave it?" onConfirm={() => void leaveGroup(t.id)} />
      </div>
    </div>
  )
}

function MemberRow({
  who,
  name,
  note,
  children,
}: {
  who: { displayName: string | null; handle: string | null; avatarPath?: string | null }
  name?: string
  note?: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2.5 last:border-0">
      <Avatar who={who} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-strong">{name ?? nameOf(who)}</span>
        {note && <span className="block truncate text-[13px] text-muted">{note}</span>}
      </span>
      {children}
    </li>
  )
}
