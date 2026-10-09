import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config'

let client: Promise<SupabaseClient> | null = null

/**
 * Supabase client for the same project Aelora verifies JWTs against.
 * URL + anon key come from VITE_SUPABASE_* if set, else from Aelora's
 * GET /api/public-config (HTTP-API.md).
 */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= (async () => {
    let url = config.supabaseUrl
    let key = config.supabaseAnonKey
    if (!url || !key) {
      const res = await fetch(`${config.baseUrl}/api/public-config`)
      if (!res.ok) throw new Error(`public-config failed (${res.status})`)
      const body = (await res.json()) as { supabase?: { url?: string; anonKey?: string } | null }
      url = body.supabase?.url ?? null
      key = body.supabase?.anonKey ?? null
    }
    if (!url || !key) throw new Error('Supabase is not configured on this Aelora deploy.')
    // Loaded on demand: mock mode never pays for it.
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(url, key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  })()
  client.catch(() => (client = null))
  return client
}

export async function signInWithGoogle(): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const sb = await getSupabase()
  await sb.auth.signOut()
}
