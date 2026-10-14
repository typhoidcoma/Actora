import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublicConfig } from '../aelora/http'
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
      const body = await getPublicConfig()
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

/**
 * What signing in asks Google for: who you are, plus your calendar and Gmail, so
 * one sign-in also connects Google (Aelora's "Path A"; no separate Connect step).
 * Keep in sync with GOOGLE_SCOPES in Aelora's
 * src/integrations/google-calendar/google-oauth.ts.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
].join(' ')

const CONNECTED_KEY = 'actora.google.connected'

/** Whether Google was connected last time we looked (this device). */
export function rememberGoogleConnected(connected: boolean): void {
  try {
    localStorage.setItem(CONNECTED_KEY, connected ? '1' : '0')
  } catch {
    /* private mode: the consent screen just shows again */
  }
}

function googleWasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

export async function signInWithGoogle(): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: config.authRedirectUrl || `${window.location.origin}${window.location.pathname}`,
      scopes: GOOGLE_SCOPES,
      // offline: Google hands back a refresh token Aelora keeps for your calendar and Gmail.
      // It only comes with a fresh consent, so the permissions screen shows until Google is
      // connected; after that, signing in is just picking the account.
      queryParams: {
        access_type: 'offline',
        prompt: googleWasConnected() ? 'select_account' : 'consent select_account',
      },
    },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const sb = await getSupabase()
  await sb.auth.signOut()
}
