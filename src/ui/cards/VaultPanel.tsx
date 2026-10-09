import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { forgetFact, loadVault, rememberFact } from '../../aelora/client'
import { useAgent } from '../../stores/agent'
import { ui } from '../../stores/ui'
import { CATEGORIES, grouped, useVault, type VaultEntry } from '../../stores/vault'
import { ROLE } from '../brand'
import { morph, press } from '../motion'
import { Panel } from './Panel'

/** The few categories offered when adding by hand; the rest arrive through Wendy. */
const ADD_AS = ['preference', 'routine', 'relationship', 'identity', 'value', 'intention']
const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Context'

/**
 * The Vault: everything Wendy remembers about the user, grouped by kind. The
 * user can add one directly or forget one (two taps, so nothing goes by
 * accident); Wendy's own remember/forget tools update it live.
 */
export function VaultPanel() {
  const { entries, status } = useVault()
  const botName = useAgent((s) => s.botName)
  const groups = useMemo(() => grouped(entries), [entries])
  const count = Object.keys(entries).length

  // Fresh every time it opens: she may have learned things since.
  useEffect(() => void loadVault(), [])

  const kicker =
    status === 'loading' && !count
      ? 'Looking through her memory…'
      : count
        ? `${count} thing${count === 1 ? '' : 's'} ${botName} remembers`
        : 'Nothing remembered yet'

  return (
    <Panel layoutId="vault" accent={ROLE.wendy} kicker={kicker} title="Vault" onClose={ui.closeVault}>
      <AddMemory />
      {status === 'error' && !count && (
        <p className="mt-6 text-[15px] text-muted">Couldn't load her memories just now. Close and open this again.</p>
      )}
      {status === 'loading' && !count && (
        <div className="mt-6 grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-12 rounded-[6px] bg-text/6" />
          ))}
        </div>
      )}
      {status === 'ready' && !count && (
        <p className="mt-6 text-[15px] text-muted">
          Nothing yet. Tell {botName} about yourself in conversation, or add something above.
        </p>
      )}
      <div className="mt-2">
        {groups.map((g) => (
          <section key={g.id} className="mt-6">
            <h3 className="label mb-2 text-muted">{g.label}</h3>
            <ul>
              <AnimatePresence initial={false}>
                {g.items.map((e) => (
                  <MemoryRow key={e.id} entry={e} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  )
}

function MemoryRow({ entry: e }: { entry: VaultEntry }) {
  const [confirm, setConfirm] = useState(false)
  // The "Forget?" state backs off by itself if it isn't confirmed.
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 3500)
    return () => clearTimeout(t)
  }, [confirm])

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
      transition={morph}
      className="flex items-start gap-3 border-b border-line py-3 last:border-0"
    >
      <p className="min-w-0 flex-1 text-[16px] leading-snug text-strong">{e.content}</p>
      <motion.button
        whileTap={press}
        onClick={() => (confirm ? void forgetFact(e.id) : setConfirm(true))}
        aria-label={confirm ? 'Confirm: forget this' : 'Forget this'}
        className={`glass-pill grid h-9 shrink-0 place-items-center rounded-[8px] px-3 text-[13px] font-semibold transition-colors ${
          confirm ? 'text-urgent' : 'text-muted'
        }`}
      >
        {confirm ? (
          'Forget'
        ) : (
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </motion.button>
    </motion.li>
  )
}

function AddMemory() {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    const ok = await rememberFact(text, category ?? undefined)
    setSaving(false)
    if (ok) {
      setText('')
      setCategory(null)
      setNote('Saved.')
    } else setNote("Couldn't save that. Try again in a moment.")
  }

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 2500)
    return () => clearTimeout(t)
  }, [note])

  return (
    <div>
      <form
        className="flex items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          void save()
        }}
      >
        <input
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          maxLength={500}
          placeholder="Add something to remember…"
          aria-label="Add a memory"
          className="glass-pill h-11 min-w-0 flex-1 rounded-[8px] bg-transparent px-4 text-[16px] text-strong outline-none placeholder:text-faint"
        />
        <motion.button
          whileTap={press}
          type="submit"
          disabled={!text.trim() || saving}
          className="h-11 shrink-0 rounded-[8px] bg-accent px-4 text-[15px] font-semibold text-on-accent transition-opacity disabled:opacity-35"
        >
          {saving ? 'Saving…' : 'Save'}
        </motion.button>
      </form>
      <AnimatePresence initial={false}>
        {text.trim() && (
          <motion.div
            key="kinds"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 overflow-hidden pt-3"
          >
            {ADD_AS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(category === id ? null : id)}
                aria-pressed={category === id}
                className={`glass-pill h-8 rounded-[6px] px-3 text-[13px] ${category === id ? 'font-semibold text-accent' : 'text-muted'}`}
              >
                {label(id)}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
    </div>
  )
}
