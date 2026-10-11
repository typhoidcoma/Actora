import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { reconnectAelora, startAelora } from '@actora/aelora/client'
import { startGreeting } from '@actora/aelora/greeting'
import { getSupabase, signInWithGoogle } from '@actora/auth/supabase'
import { startAppearanceSync } from '@actora/stores/appearance'
import { startCheckins } from '@actora/checkins/checkins'
import { config } from '@actora/config'
import { startAgentOptions } from '@actora/options/agentOptions'
import { startRanking } from '@actora/priority/rank'
import { useAgent } from '@actora/stores/agent'
import { useThemeSync } from '@actora/ui/Theme'
import { World } from './scene/World'

type Auth =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; sb: SupabaseClient; userId: string }

function firstName(session: Session): string | null {
  const meta = session.user.user_metadata as { given_name?: string; full_name?: string; name?: string }
  return (meta.given_name ?? meta.full_name ?? meta.name)?.trim().split(/\s+/)[0] || null
}

export default function App() {
  return config.mock ? <MockApp /> : <AuthedApp />
}

function MockApp() {
  useEffect(() => startAelora({ getToken: async () => 'mock' }), [])
  return <Live />
}

function AuthedApp() {
  const [auth, setAuth] = useState<Auth>({ status: 'loading' })

  useEffect(() => {
    let off: (() => void) | undefined
    let cancelled = false
    const apply = (sb: SupabaseClient, session: Session | null) => {
      if (session) useAgent.setState({ userName: firstName(session) })
      setAuth((prev) =>
        session
          ? prev.status === 'signed-in' && prev.userId === session.user.id
            ? prev
            : { status: 'signed-in', sb, userId: session.user.id }
          : { status: 'signed-out' },
      )
    }
    getSupabase()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession()
        if (cancelled) return
        apply(sb, data.session)
        const sub = sb.auth.onAuthStateChange((event, session) => {
          apply(sb, session)
          if (event === 'TOKEN_REFRESHED') reconnectAelora()
        })
        off = () => sub.data.subscription.unsubscribe()
      })
      .catch((e: unknown) =>
        setAuth({ status: 'signed-out', error: e instanceof Error ? e.message : 'Could not reach Aelora' }),
      )
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  if (auth.status === 'loading') return null
  if (auth.status === 'signed-out')
    return (
      <div className="notice">
        <div>
          {auth.error && <p>{auth.error}</p>}
          <button onClick={() => void signInWithGoogle()}>Sign in with Google</button>
        </div>
      </div>
    )
  return <Connected key={auth.userId} sb={auth.sb} userId={auth.userId} />
}

function Connected({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  // Day/dusk and the agent's colours follow the account, as in 2D.
  useEffect(() => startAppearanceSync(sb), [sb])
  useEffect(
    () =>
      startAelora({
        userId,
        getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
        onReauth: async () => {
          await sb.auth.refreshSession()
        },
      }),
    [sb, userId],
  )
  return <Live />
}

/** The same background loops the 2D Stage runs, minus the ones that only drive DOM panels. */
function Live() {
  // data-theme on <html>: the 2D panels' CSS tokens follow day/dusk.
  useThemeSync()
  useEffect(() => startAgentOptions(), [])
  useEffect(() => startRanking(), [])
  useEffect(() => startGreeting(), [])
  useEffect(() => startCheckins(), [])
  return <World />
}
