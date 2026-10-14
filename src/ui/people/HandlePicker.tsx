import { motion } from 'motion/react'
import { useState } from 'react'
import { claimHandle } from '../../social/social'
import { useSocial } from '../../stores/social'
import { press } from '../motion'

const SAY: Record<string, string> = {
  handle_taken: 'Someone already has that one.',
  handle_reserved: "That one's reserved. Try another.",
  invalid_handle: '3 to 20 letters, numbers or _.',
  rate_limited: 'Too many tries. Give it a minute.',
}

/** First run: the name friends find you by. */
export function HandlePicker() {
  const error = useSocial((s) => s.errors.claim ?? null)
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [sent, setSent] = useState(false)
  const clean = handle.trim().replace(/^@/, '').toLowerCase()
  const valid = /^[a-z0-9_]{3,20}$/.test(clean)

  return (
    <form
      className="grid max-w-[460px] gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        setSent(true)
        claimHandle(clean, name)
      }}
    >
      <p className="text-[15px] leading-snug text-muted">
        Pick a handle so friends can find you. Only people you accept can message you.
      </p>
      <label className="glass-pill flex h-12 items-center rounded-[8px] px-4">
        <span className="text-[16px] text-faint">@</span>
        <input
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value.replace(/\s/g, ''))
            setSent(false)
          }}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={21}
          placeholder="yourname"
          aria-label="Handle"
          className="h-full min-w-0 flex-1 bg-transparent pl-1 text-[16px] text-strong outline-none placeholder:text-faint"
        />
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="Your name (optional)"
        aria-label="Display name"
        className="glass-pill h-12 rounded-[8px] bg-transparent px-4 text-[16px] text-strong outline-none placeholder:text-faint"
      />
      <p className="min-h-5 text-[13px] text-muted" aria-live="polite">
        {sent && error ? (
          <span className="text-urgent">{SAY[error] ?? "That didn't work. Try again."}</span>
        ) : clean && !valid ? (
          SAY.invalid_handle
        ) : null}
      </p>
      <motion.button
        whileTap={press}
        type="submit"
        disabled={!valid || (sent && !error)}
        className="h-12 rounded-[8px] bg-fill text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
      >
        {sent && !error ? 'Saving…' : 'Claim handle'}
      </motion.button>
    </form>
  )
}
