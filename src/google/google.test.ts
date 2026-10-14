import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A real backend, not the mock (which never talks to Google).
vi.mock('../config', () => ({
  config: {
    baseUrl: 'https://aelora.test',
    mock: false,
    authRedirectUrl: '',
    supabaseUrl: 'https://sb.test',
    supabaseAnonKey: 'anon',
  },
}))
// The Supabase client, as far as signing in goes.
const signInWithOAuth = vi.fn((_: unknown) => Promise.resolve({ error: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithOAuth } }) }))

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  vi.stubGlobal('window', {
    location: { origin: 'https://actora.test', pathname: '/' },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('one-step Google sign-in', () => {
  it('hands the refresh token from sign-in to Aelora once, and retries after a failure', async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | undefined }> = []
    let ok = false
    vi.stubGlobal('fetch', (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization })
      return Promise.resolve({ ok, json: () => Promise.resolve({ connected: true, configured: true }) })
    })
    const { linkGoogleFromSession } = await import('./google')
    const { GOOGLE_SCOPES } = await import('../auth/supabase')

    await linkGoogleFromSession({ access_token: 'jwt', provider_refresh_token: null })
    expect(calls).toHaveLength(0) // a normal session (not just back from Google): nothing to hand over

    await linkGoogleFromSession({ access_token: 'jwt', provider_refresh_token: 'rt-1' })
    expect(calls[0]).toEqual({
      url: 'https://aelora.test/api/google/calendar/connect-token',
      body: { refresh_token: 'rt-1', scope: GOOGLE_SCOPES },
      auth: 'Bearer jwt',
    })
    // Refused: the next auth event may try again.
    ok = true
    await linkGoogleFromSession({ access_token: 'jwt', provider_refresh_token: 'rt-1' })
    expect(calls).toHaveLength(2)
    // Connected: the same token isn't sent again.
    await linkGoogleFromSession({ access_token: 'jwt', provider_refresh_token: 'rt-1' })
    expect(calls.filter((c) => c.url.endsWith('/connect-token'))).toHaveLength(2)
  })

  it('asks for calendar and Gmail, with the account chooser and permissions screen every time', async () => {
    const { GOOGLE_SCOPES, signInWithGoogle } = await import('../auth/supabase')
    expect(GOOGLE_SCOPES.split(' ')).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.settings.basic',
    ])
    await signInWithGoogle()
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://actora.test/',
        scopes: GOOGLE_SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent select_account' },
      },
    })
  })
})
