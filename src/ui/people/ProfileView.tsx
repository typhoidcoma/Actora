import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { claimHandle, updateProfile } from '../../social/social'
import { useSocial } from '../../stores/social'
import { press } from '../motion'

const HANDLE_SAY: Record<string, string> = {
  handle_taken: 'Someone already has that one.',
  handle_reserved: "That one's reserved. Try another.",
  invalid_handle: '3 to 20 letters, numbers or _.',
  rate_limited: 'Too many changes today. Try again tomorrow.',
}

/** Your name, your handle, and who can find you. */
export function ProfileView() {
  const profile = useSocial((s) => s.profile)
  const errors = useSocial((s) => s.errors)
  const [name, setName] = useState(profile?.displayName ?? '')
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [saving, setSaving] = useState<'name' | 'handle' | null>(null)
  const [saved, setSaved] = useState<'name' | 'handle' | null>(null)

  // The server's answer lands as a new profile (or an error): settle the form on it.
  useEffect(() => {
    if (!saving || !profile) return
    const done = saving === 'name' ? (profile.displayName ?? '') === name.trim() : profile.handle === handle.trim().replace(/^@/, '').toLowerCase()
    if (done) {
      setSaved(saving)
      setSaving(null)
    }
  }, [profile, saving, name, handle])
  useEffect(() => {
    if (saving === 'handle' && errors.claim) setSaving(null)
    if (saving === 'name' && errors.profile) setSaving(null)
  }, [errors.claim, errors.profile, saving])
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(null), 4000)
    return () => clearTimeout(t)
  }, [saved])

  if (!profile) return null
  const cleanHandle = handle.trim().replace(/^@/, '').toLowerCase()
  const handleValid = /^[a-z0-9_]{3,20}$/.test(cleanHandle)
  const nameChanged = name.trim() !== (profile.displayName ?? '')
  const handleChanged = cleanHandle !== profile.handle

  return (
    <div className="grid max-w-[520px] gap-6">
      <section>
        <h3 className="label mb-2">Your name</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nameChanged) return
            setSaving('name')
            updateProfile({ displayName: name.trim() })
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="What friends see (optional)"
            aria-label="Your name"
            className="glass-pill h-11 min-w-0 flex-1 rounded-[8px] bg-transparent px-4 text-[16px] text-strong outline-none placeholder:text-faint"
          />
          <motion.button
            whileTap={press}
            type="submit"
            disabled={!nameChanged || saving === 'name'}
            className="h-11 shrink-0 rounded-[8px] bg-fill px-4 text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
          >
            {saving === 'name' ? 'Saving…' : 'Save'}
          </motion.button>
        </form>
        <p className="mt-2 min-h-5 text-[13px] text-muted" aria-live="polite">
          {errors.profile ? (
            <span className="text-urgent">Couldn't save that. Try again.</span>
          ) : saved === 'name' ? (
            'Saved.'
          ) : (
            'Leave it empty to go by your handle.'
          )}
        </p>
      </section>

      <section>
        <h3 className="label mb-2">Your handle</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!handleChanged || !handleValid) return
            setSaving('handle')
            claimHandle(cleanHandle)
          }}
        >
          <label className="glass-pill flex h-11 min-w-0 flex-1 items-center rounded-[8px] px-4">
            <span className="text-[16px] text-faint">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/\s/g, '').replace(/^@/, ''))}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              aria-label="Your handle"
              className="h-full min-w-0 flex-1 bg-transparent pl-1 text-[16px] text-strong outline-none"
            />
          </label>
          <motion.button
            whileTap={press}
            type="submit"
            disabled={!handleChanged || !handleValid || saving === 'handle'}
            className="h-11 shrink-0 rounded-[8px] bg-fill px-4 text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
          >
            {saving === 'handle' ? 'Saving…' : 'Change'}
          </motion.button>
        </form>
        <p className="mt-2 min-h-5 text-[13px] text-muted" aria-live="polite">
          {errors.claim && handleChanged ? (
            <span className="text-urgent">{HANDLE_SAY[errors.claim] ?? "That didn't work. Try again."}</span>
          ) : saved === 'handle' ? (
            'Changed. Friends find you by this now.'
          ) : handleChanged && !handleValid ? (
            HANDLE_SAY.invalid_handle
          ) : (
            'Your friends stay your friends. Your old handle becomes free for someone else.'
          )}
        </p>
      </section>

      <section>
        <h3 className="label mb-1">Who can find you</h3>
        <Switch
          label="By your handle"
          hint="Off: only invite links and QR codes reach you."
          on={profile.discoverable !== false}
          onChange={(v) => updateProfile({ discoverable: v })}
        />
        <Switch
          label="By your email"
          hint="Someone who types your exact email can send a request."
          on={profile.emailDiscoverable === true}
          onChange={(v) => updateProfile({ emailDiscoverable: v })}
        />
      </section>
    </div>
  )
}

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-strong">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-fill' : 'bg-text/15'}`}
      >
        <motion.span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          animate={{ left: on ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      </span>
    </button>
  )
}
