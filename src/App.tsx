import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { reconnectAelora, startAelora } from './aelora/client'
import { getSupabase, signOut } from './auth/supabase'
import { SignIn } from './auth/SignIn'
import { config } from './config'
import { Backdrop, Stage } from './ui/Stage'

type Auth =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; sb: SupabaseClient; userId: string }

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
    const apply = (sb: SupabaseClient, session: Session | null) =>
      setAuth((prev) =>
        session
          ? prev.status === 'signed-in' && prev.userId === session.user.id
            ? prev
            : { status: 'signed-in', sb, userId: session.user.id }
          : { status: 'signed-out' },
      )

    getSupabase()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession()
        apply(sb, data.session)
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
    return () => off?.()
  }, [])

  if (auth.status === 'loading') return <Backdrop />
  if (auth.status === 'signed-out') return <SignIn error={auth.error} />
  return <Connected key={auth.userId} sb={auth.sb} />
}

function Connected({ sb }: { sb: SupabaseClient }) {
  useEffect(
    () =>
      startAelora({
        getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
        onReauth: async () => {
          await sb.auth.refreshSession()
        },
      }),
    [sb],
  )

  return <Stage onSignOut={() => void signOut()} />
}
