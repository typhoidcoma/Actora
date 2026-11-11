import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { forgetFact, loadVault, rememberFact, setAssistantHidden } from '../../aelora/client'
import { useSocial } from '../../stores/social'
import { useAgent } from '../../stores/agent'
import { ui } from '../../stores/ui'
import {
  CATEGORIES,
  categoryCounts,
  filterEntries,
  grouped,
  searchTerms,
  useVault,
  vault,
  type VaultEntry,
} from '../../stores/vault'
import { ROLE } from '../brand'
import { morph, press } from '../motion'
import { Panel } from './Panel'

/** The few categories offered when adding by hand; the rest arrive through the agent. */
const ADD_AS = ['preference', 'routine', 'relationship', 'identity', 'value', 'intention']
const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Context'

/**
 * The Vault: everything the agent remembers about the user, grouped by kind. The
 * user can add one directly or forget one (two taps, so nothing goes by
 * accident); the agent's own remember/forget tools update it live.
 */
export function VaultPanel() {
  const { entries, status, query, category } = useVault()
  const botName = useAgent((s) => s.botName)
  const setQuery = vault.search
  const setCategory = vault.showCategory
  const [adding, setAdding] = useState(false)
  const shown = useMemo(() => filterEntries(entries, query, category), [entries, query, category])
  const groups = useMemo(() => grouped(shown), [shown])
  const cats = useMemo(() => categoryCounts(entries), [entries])
  const terms = useMemo(() => searchTerms(query), [query])
  const count = Object.keys(entries).length
  const matches = Object.keys(shown).length
  const filtering = !!query.trim() || category !== null

  // Fresh every time it opens: she may have learned things since.
  useEffect(() => void loadVault(), [])
  // A category that just emptied (its last memory forgotten) drops back to All.
  // (Only once loaded, so a category the agent picked survives the first fetch.)
  const emptied = status === 'ready' && !!category && !cats.some((c) => c.id === category)
  useEffect(() => {
    if (emptied) setCategory(null)
  }, [emptied, setCategory])

  const kicker =
    status === 'loading' && !count
      ? `Looking through what ${botName} remembers…`
      : filtering
        ? `${matches} of ${count}`
        : count
          ? `${count} thing${count === 1 ? '' : 's'} ${botName} remembers`
          : 'Nothing remembered yet'

  return (
    <Panel layoutId="vault" accent={ROLE.agent} kicker={kicker} title="Vault" onClose={ui.closeVault}>
      {/* Search first; adding sits behind + so the list leads. */}
      <div className="flex items-center gap-2">
        <label className="glass-pill flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] px-3">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
          <input
            name="vault-search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={`Search what ${botName} knows`}
            aria-label="Search the Vault"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-strong outline-none placeholder:text-faint"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="hit grid h-7 w-7 place-items-center text-muted"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </button>
          )}
        </label>
        <motion.button
          whileTap={press}
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          aria-label={adding ? 'Close adding' : 'Add a memory'}
          className={`glass-pill grid h-11 w-11 shrink-0 place-items-center rounded-[8px] ${adding ? 'text-accent' : 'text-muted'}`}
        >
          <motion.svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden animate={{ rotate: adding ? 45 : 0 }}>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          </motion.svg>
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            key="add"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-3"
          >
            <AddMemory defaultCategory={category} onSaved={() => setAdding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories: jump to one kind of memory (with search, they narrow together). */}
      {cats.length > 1 && (
        <div className="scroll-x -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: null as string | null, label: 'All', n: count }, ...cats].map((c) => {
            const on = category === c.id
            return (
              <button
                key={c.id ?? 'all'}
                onClick={() => setCategory(on && c.id ? null : c.id)}
                aria-pressed={on}
                className={`glass-pill flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-[13px] ${on ? 'font-semibold text-accent' : 'text-muted'}`}
              >
                {c.label}
                <span className="num opacity-60">{c.n}</span>
              </button>
            )
          })}
        </div>
      )}

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
          Nothing yet. Tell {botName} about yourself in conversation, or tap + to add something.
        </p>
      )}
      {count > 0 && filtering && !matches && (
        <p className="mt-6 text-[15px] text-muted">
          {query.trim() ? (
            <>
              Nothing matches “{query.trim()}”{category ? ' here' : ''}.
            </>
          ) : (
            'Nothing here yet.'
          )}
        </p>
      )}
      <div className="mt-1">
        {groups.map((g) => (
          <section key={g.id} className="mt-5">
            {/* One category picked: its chip already says which. */}
            {!category && <h3 className="label mb-2 text-muted">{g.label}</h3>}
            <ul>
              <AnimatePresence initial={false}>
                {g.items.map((e) => (
                  <MemoryRow key={e.id} entry={e} terms={terms} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  )
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The memory's text with each searched word picked out. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi')
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-[3px] bg-accent/20 px-0.5 text-strong">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

function MemoryRow({ entry: e, terms }: { entry: VaultEntry; terms: string[] }) {
  const [confirm, setConfirm] = useState(false)
  // Only when your receptionist is on and shares this entry's section.
  const shared = useSocial(
    (s) =>
      s.profile?.assistantMode === 'friends' &&
      !!e.category &&
      (s.profile.assistantSharedCategories ?? []).includes(e.category),
  )
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
      <div className="min-w-0 flex-1">
        <p className="selectable text-[16px] leading-snug text-strong">
          <Highlighted text={e.content} terms={terms} />
        </p>
        {shared && (
          // Its section is shared with friends' messages to your assistant: this one can stay private.
          <button
            onClick={() => void setAssistantHidden(e.id, !e.assistant_hidden)}
            aria-pressed={!!e.assistant_hidden}
            className="mt-1 text-[12px] font-medium text-muted underline decoration-line underline-offset-4"
          >
            {e.assistant_hidden ? 'Hidden from friends · Share' : 'Friends can hear this · Hide'}
          </button>
        )}
      </div>
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

function AddMemory({ defaultCategory, onSaved }: { defaultCategory: string | null; onSaved: () => void }) {
  const [text, setText] = useState('')
  // Adding while a category is picked files it there by default.
  const [category, setCategory] = useState<string | null>(
    defaultCategory && ADD_AS.includes(defaultCategory) ? defaultCategory : null,
  )
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
      onSaved()
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
          name="memory"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          maxLength={500}
          autoFocus
          placeholder="Add something to remember…"
          aria-label="Add a memory"
          className="glass-pill h-11 min-w-0 flex-1 rounded-[8px] bg-transparent px-4 text-[16px] text-strong outline-none placeholder:text-faint"
        />
        <motion.button
          whileTap={press}
          type="submit"
          disabled={!text.trim() || saving}
          className="h-11 shrink-0 rounded-[8px] bg-fill px-4 text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
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
