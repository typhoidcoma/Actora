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

describe('connecting Google through the popup', () => {
  const AELORA = 'https://aelora.test'
  type Call = { url: string; method?: string; body?: unknown; auth?: string }
  let calls: Call[]
  let finish: { status: number; body: Record<string, unknown> }

  beforeEach(async () => {
    calls = []
    finish = { status: 200, body: { ok: true, synced: true } }
    vi.stubGlobal('fetch', (url: string, init: { method?: string; body?: string; headers: Record<string, string> }) => {
      calls.push({
        url,
        method: init.method,
        body: init.body ? JSON.parse(init.body) : undefined,
        auth: init.headers.Authorization,
      })
      const r = url.endsWith('/finish')
        ? finish
        : { status: 200, body: { configured: true, connected: true, google_email: 'me@x.com' } }
      return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body) })
    })
    const { setTokenSource } = await import('../aelora/http')
    setTokenSource(async () => 'jwt')
  })

  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('ignores messages from anywhere but Aelora', async () => {
    const { onGoogleMessage } = await import('./google')
    onGoogleMessage({ origin: 'https://evil.test', data: { type: 'aelora:gcal-code', code: 'c0', state: 's' } })
    await settle()
    expect(calls).toHaveLength(0)
  })

  it('redeems the code as the signed-in user, once', async () => {
    const { onGoogleMessage } = await import('./google')
    const { useToast } = await import('../stores/toast')
    const msg = { origin: AELORA, data: { type: 'aelora:gcal-code', code: 'c1', state: 'st1' } }
    onGoogleMessage(msg)
    onGoogleMessage(msg) // the same code twice: Google takes it once
    await settle()
    await settle()
    const fin = calls.filter((c) => c.url.endsWith('/finish'))
    expect(fin).toEqual([
      { url: `${AELORA}/api/google/calendar/finish`, method: 'POST', body: { code: 'c1', state: 'st1' }, auth: 'Bearer jwt' },
    ])
    expect(useToast.getState().toasts.at(-1)?.text).toBe('Google connected · me@x.com')
  })

  it('skips a message missing its code or state', async () => {
    const { onGoogleMessage } = await import('./google')
    onGoogleMessage({ origin: AELORA, data: { type: 'aelora:gcal-code', code: 'c2' } })
    onGoogleMessage({ origin: AELORA, data: { type: 'aelora:gcal-code', code: 42, state: 's' } })
    await settle()
    expect(calls).toHaveLength(0)
  })

  it('says why when Aelora refuses', async () => {
    const { onGoogleMessage } = await import('./google')
    const { useToast } = await import('../stores/toast')
    finish = { status: 403, body: { error: 'state_user_mismatch' } }
    onGoogleMessage({ origin: AELORA, data: { type: 'aelora:gcal-code', code: 'c3', state: 's' } })
    await settle()
    await settle()
    expect(useToast.getState().toasts.at(-1)).toMatchObject({
      text: 'This sign-in was started from another account.',
      tone: 'error',
    })
  })

  it('puts each refusal in plain words', async () => {
    const { connectError } = await import('./google')
    expect(connectError(400, 'invalid or expired state')).toBe('That link expired. Try connecting again.')
    expect(connectError(400, 'no_refresh_token')).toMatch(/third-party access/)
    expect(connectError(400, 'code rejected by Google: invalid_grant')).toBe('Try connecting again.')
    expect(connectError(503, undefined)).toBe("Google isn't set up on this server yet.")
    expect(connectError(500, undefined)).toBe("Couldn't connect Google.")
  })

  it('still hears an Aelora from before the fix', async () => {
    const { onGoogleMessage } = await import('./google')
    onGoogleMessage({ origin: AELORA, data: { type: 'aelora:gcal-connected' } })
    await settle()
    expect(calls.map((c) => c.url)).toEqual([`${AELORA}/api/google/calendar/status`])
  })
})

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
