const env = import.meta.env

const baseUrl = (env.VITE_AELORA_BASE_URL ?? '').trim().replace(/\/+$/, '')

export const config = {
  /** Aelora HTTP origin, e.g. https://aelora.example.run.app */
  baseUrl,
  /** WebSocket endpoint derived from the HTTP origin. */
  wsUrl: baseUrl ? `${baseUrl.replace(/^http/, 'ws')}/ws` : '',
  /** Mock mode: explicit flag, or no backend configured at all. */
  mock: env.VITE_AELORA_MOCK === '1' || !baseUrl,
  supabaseUrl: env.VITE_SUPABASE_URL?.trim() || null,
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim() || null,
  /** Where Google sends the user back (must be an allowed Supabase redirect URL). */
  authRedirectUrl: env.VITE_SUPABASE_AUTH_REDIRECT_URL?.trim() || null,
} as const
