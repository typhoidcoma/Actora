import { motion, MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { useAgent } from '../stores/agent'
import { press } from '../ui/motion'
import { Orb } from '../ui/orb/Orb'
import { Backdrop } from '../ui/Stage'
import { useThemeSync } from '../ui/Theme'
import { signInWithGoogle } from './supabase'

export function SignIn({ error: initialError }: { error?: string | null }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  useThemeSync()
  // Wake the orb up on the sign-in screen.
  useEffect(() => useAgent.setState({ phase: busy ? 'thinking' : 'idle' }), [busy])

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle() // navigates away on success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-10 p-6">
        <motion.div
          className="relative h-[min(60vw,340px)] w-[min(60vw,340px)]"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        >
          <Orb />
        </motion.div>

        <motion.div
          className="flex flex-col items-center gap-3 text-center"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 24 }}
        >
          <h1 className="display text-6xl leading-none text-strong">Actora</h1>
          <p className="max-w-xs text-[15px] text-muted">
            Your day, at a touch. Sign in and Wendy takes it from there.
          </p>
        </motion.div>

        <motion.button
          whileTap={press}
          disabled={busy}
          onClick={go}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 24 }}
          className="glass-pill flex h-14 w-full max-w-xs items-center justify-center gap-3 rounded-full font-medium text-strong disabled:opacity-60"
        >
          <GoogleMark />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </motion.button>

        {error && <p className="max-w-xs text-center text-sm text-clay">{error}</p>}
      </main>
    </MotionConfig>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
