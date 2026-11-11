import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { lazy, Suspense, useEffect, useState } from 'react'
import { startAelora } from '@actora/aelora/client'
import { startGreeting } from '@actora/aelora/greeting'
import { getSupabase, signInWithGoogle } from '@actora/auth/supabase'
import { linkGoogleFromSession } from '@actora/google/google'
import { startAppearanceSync } from '@actora/stores/appearance'
import { startCheckins } from '@actora/checkins/checkins'
import { config } from '@actora/config'
import { startAgentOptions } from '@actora/options/agentOptions'
import { startRanking } from '@actora/priority/rank'
import { useAgent } from '@actora/stores/agent'
import { useThemeSync } from '@actora/ui/Theme'
import { startLongAnswers } from './look/longAnswers'
import { startThinkAway } from './look/thinkAway'
import { startPush } from '@actora/push/start'
import { loadWorld } from './look/loadWorld'
import { Loader } from './dom/Loader'
import { markReady } from './look/ready'
import { useEntities } from '@actora/stores/entities'
import { startLineRelease } from '@actora/stores/lineRelease'

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
      // Just back from Google: signing in asked for calendar and Gmail too; connect them now.
      if (session) void linkGoogleFromSession(session)
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
        // No reconnect on TOKEN_REFRESHED (as in 2D): it would end any reply she's in the middle of.
        const sub = sb.auth.onAuthStateChange((...[, session]) => apply(sb, session))
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

  if (auth.status === 'loading') return <Loader />
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

/** The scene and everything 3D: its own chunk, already loading (main.tsx starts it). */
const World = lazy(() => loadWorld().then((m) => ({ default: m.World })))

/** The same background loops the 2D Stage runs, minus the ones that only drive DOM panels. */
function Live() {
  // data-theme on <html>: the 2D panels' CSS tokens follow day/dusk.
  useThemeSync()
  useEffect(() => startAgentOptions(), [])
  useEffect(() => startRanking(), [])
  useEffect(() => startGreeting(), [])
  useEffect(() => startCheckins(), [])
  // Reminders on the lock screen, like the 2D app; a tap opens this app on the reminder or the conversation.
  useEffect(() => startPush(), [])
  useEffect(() => startLongAnswers(), [])
  // Her line letting go of a reply, a seen welcome, a reminder that's been read (as in 2D).
  useEffect(() => startLineRelease(), [])
  useEffect(() => startThinkAway(), [])
  // Their data is in once tasks or the calendar have loaded (or the backend's
  // gone quiet for a few seconds: the scene doesn't wait on it forever).
  useEffect(() => {
    const check = () => {
      const h = useEntities.getState().hydrated
      if (h.tasks || h.events) markReady('data')
    }
    check()
    const off = useEntities.subscribe(check)
    const t = setTimeout(() => markReady('data'), 6000)
    return () => {
      off()
      clearTimeout(t)
    }
  }, [])
  return (
    <Suspense fallback={<Loader />}>
      <World />
    </Suspense>
  )
}
