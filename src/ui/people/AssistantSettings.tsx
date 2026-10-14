import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { hideFromAssistant, loadAssistantPreview, updateProfile } from '../../social/social'
import { SHAREABLE } from '../../social/types'
import { useSocial } from '../../stores/social'
import { useAgent } from '../../stores/agent'
import { press } from '../motion'
import { Switch } from './Switch'

const ABOUT_MAX = 1000

/**
 * Receptionist mode, as the owner sets it: whether friends can message your
 * agent, which vault sections she may share, a note, and exactly what that adds
 * up to ("What friends can hear", from the same query she uses), with a Hide on
 * each thing. Free/busy is always hers to use; titles and details never are.
 */
export function AssistantSettings() {
  const profile = useSocial((s) => s.profile)
  const preview = useSocial((s) => s.preview)
  const previewError = useSocial((s) => s.errors.preview ?? null)
  const bot = useAgent((s) => s.botName)
  const on = profile?.assistantMode === 'friends'
  const shared = useMemo(() => new Set(profile?.assistantSharedCategories ?? []), [profile?.assistantSharedCategories])
  const [about, setAbout] = useState(profile?.assistantAbout ?? '')
  const [aboutSaved, setAboutSaved] = useState(false)

  // Fresh whenever the settings change (and on opening): what she'd actually share now.
  const key = `${profile?.assistantMode}|${[...shared].sort().join(',')}|${profile?.assistantAbout ?? ''}`
  useEffect(() => {
    if (on) loadAssistantPreview()
  }, [key, on])
  useEffect(() => {
    if (!aboutSaved) return
    const t = setTimeout(() => setAboutSaved(false), 4000)
    return () => clearTimeout(t)
  }, [aboutSaved])

  if (!profile) return null
  const aboutChanged = about.trim() !== (profile.assistantAbout ?? '')
  const toggleSection = (id: string) => {
    const next = new Set(shared)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    updateProfile({ assistantSharedCategories: SHAREABLE.map((c) => c.id).filter((c) => next.has(c)) })
  }
  const groups = groupBySection(preview?.entries ?? [])

  return (
    <section>
      <h3 className="label mb-1">Your assistant</h3>
      <Switch
        label="Friends can message your assistant"
        hint={`${bot} answers for you: when you're free, what you share below, and messages for you. Never books or promises anything.`}
        on={on}
        onChange={(v) => updateProfile({ assistantMode: v ? 'friends' : 'off' })}
      />

      {on && (
        <div className="mt-4 grid gap-5">
          <div>
            <p className="mb-2 text-[13px] text-muted">
              {bot} always knows when you're free or busy, never what or where. Pick what else to share:
            </p>
            <div className="flex flex-wrap gap-2">
              {SHAREABLE.map((c) => {
                const picked = shared.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleSection(c.id)}
                    aria-pressed={picked}
                    className={`glass-pill h-9 rounded-[6px] px-3 text-[13px] font-semibold ${picked ? 'text-accent' : 'text-muted'}`}
                  >
                    {picked ? '✓ ' : ''}
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!aboutChanged) return
              updateProfile({ assistantAbout: about.trim() })
              setAboutSaved(true)
            }}
          >
            <label className="mb-2 block text-[13px] text-muted" htmlFor="assistant-about">
              A note for friends (optional): how you like to be reached, what you're up to.
            </label>
            <textarea
              id="assistant-about"
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX))}
              rows={3}
              className="glass-pill w-full resize-y rounded-[8px] bg-transparent px-4 py-3 text-[16px] leading-snug text-strong outline-none placeholder:text-faint"
              placeholder="e.g. Best to text after 6pm. Training for a half marathon."
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12px] text-faint">{aboutSaved ? 'Saved.' : `${about.length} / ${ABOUT_MAX}`}</span>
              <motion.button
                whileTap={press}
                type="submit"
                disabled={!aboutChanged}
                className="h-10 shrink-0 rounded-[8px] bg-fill px-4 text-[14px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
              >
                Save note
              </motion.button>
            </div>
          </form>

          <div>
            <h4 className="label mb-1">What friends can hear</h4>
            <p className="mb-2 text-[13px] text-muted">
              Everything in a shared section, including what {bot} learns on her own. Check back now and then.
            </p>
            {previewError ? (
              <p className="text-[15px] text-urgent">Couldn't load this just now.</p>
            ) : !preview ? (
              <div className="shimmer h-12 rounded-[6px] bg-text/6" />
            ) : !preview.entries.length && !preview.about ? (
              <p className="text-[15px] text-muted">Only when you're free. Nothing else is shared.</p>
            ) : (
              <div className="grid gap-4">
                {preview.about && (
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-muted">Your note</p>
                    <p className="selectable text-[15px] leading-snug text-strong">{preview.about}</p>
                  </div>
                )}
                {groups.map((g) => (
                  <div key={g.section}>
                    <p className="mb-1 text-[12px] font-semibold text-muted">{g.section}</p>
                    <ul>
                      {g.entries.map((e) => (
                        <li key={e.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
                          <p className="selectable min-w-0 flex-1 text-[15px] leading-snug text-strong">{e.content}</p>
                          <button
                            onClick={() => hideFromAssistant(e.id)}
                            aria-label={`Hide from friends: ${e.content.slice(0, 60)}`}
                            className="glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
                          >
                            Hide
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function groupBySection(entries: Array<{ id: string; section: string; content: string; category: string }>) {
  const order = SHAREABLE.map((c) => c.label)
  const by = new Map<string, typeof entries>()
  for (const e of entries) by.set(e.section, [...(by.get(e.section) ?? []), e])
  return [...by.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([section, list]) => ({ section, entries: list }))
}
