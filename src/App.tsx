import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { reconnectAelora, startAelora } from './aelora/client'
import { getSupabase, signOut } from './auth/supabase'
import { linkGoogleFromSession } from './google/google'
import { SignIn } from './auth/SignIn'
import { config } from './config'
import { startAppearanceSync } from './stores/appearance'
import { useAgent } from './stores/agent'
import { Backdrop, Stage } from './ui/Stage'
import { useThemeSync } from './ui/Theme'

type Auth =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; sb: SupabaseClient; userId: string }

/** First name from the Google profile, for the agent's greeting. */
function firstName(session: Session): string | null {
  const meta = session.user.user_metadata as { given_name?: string; full_name?: string; name?: string }
  const name = meta.given_name ?? meta.full_name ?? meta.name
  return name?.trim().split(/\s+/)[0] || null
}

/** Error from an OAuth redirect (?error_description= or #error_description=), cleared from the address bar. */
function oauthError(): string | null {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const msg = url.searchParams.get('error_description') ?? hash.get('error_description')
  if (!msg) return null
  window.history.replaceState(null, '', url.pathname)
  return `Sign-in failed: ${msg.replaceAll('+', ' ')}`
}

function Loading() {
  useThemeSync()
  return <Backdrop />
}

export default function App() {
  return config.mock ? <MockApp /> : <AuthedApp />
}

function MockApp() {
  useEffect(() => startAelora({ getToken: async () => 'mock' }), [])
  return <Stage />
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
        const { data, error } = await sb.auth.getSession()
        if (cancelled) return
        apply(sb, data.session)
        // A failed OAuth return (denied consent, bad redirect, expired code) says why in the URL.
        const why = oauthError() ?? (data.session ? null : error?.message)
        if (why && !data.session) setAuth({ status: 'signed-out', error: why })
        const sub = sb.auth.onAuthStateChange((event, session) => {
          apply(sb, session)
          // The JWT is pinned into the socket at connect time; reconnect with the new one.
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

  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'signed-out') return <SignIn error={auth.error} />
  return <Connected key={auth.userId} sb={auth.sb} userId={auth.userId} />
}

function Connected({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  // Her day/dusk and colour changes follow the account to every device.
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

  return <Stage onSignOut={() => void signOut()} />
}
