import { config } from '../config'

// Aelora's small HTTP surface (docs/HTTP-API.md). Auth is the Supabase JWT as a
// Bearer header only; the WebSocket's ?token= form is rejected here.

let tokenSource: (() => Promise<string | null>) | null = null

export function setTokenSource(fn: (() => Promise<string | null>) | null): void {
  tokenSource = fn
}

/** An authenticated call to Aelora's HTTP API; resolves with the status and parsed body. */
export async function api<T = Record<string, unknown>>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  payload?: unknown,
): Promise<{ ok: boolean; status: number; body: T }> {
  const token = await tokenSource?.()
  if (!token) return { ok: false, status: 401, body: {} as T }
  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  })
  const body = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, status: res.status, body }
}

export interface LlmRequest {
  prompt: string
  system?: string
  maxTokens?: number
  json?: boolean
  smart?: boolean
  context?: { memoryQuery?: string; memoryLimit?: number; profile?: boolean; facts?: boolean }
}

export class LlmError extends Error {
  readonly status: number
  readonly retryAfterMs: number | null
  constructor(status: number, message: string, retryAfterMs: number | null) {
    super(message)
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** One-shot, stateless LLM call: no persona, no tools, no history. */
export async function llm(body: LlmRequest, signal?: AbortSignal): Promise<string> {
  const token = await tokenSource?.()
  if (!token) throw new LlmError(401, 'signed out', null)
  const res = await fetch(`${config.baseUrl}/api/llm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string }
  if (!res.ok || !data.ok) {
    const retry = Number(res.headers.get('Retry-After'))
    throw new LlmError(res.status, data.error ?? `HTTP ${res.status}`, retry > 0 ? retry * 1000 : null)
  }
  return data.text ?? ''
}

let publicConfig: Promise<PublicConfig> | null = null
interface PublicConfig {
  supabase: { url: string; anonKey: string } | null
  push: { publicKey: string } | null
}

/** GET /api/public-config, fetched once and shared (Supabase bootstrap + VAPID key). */
export function getPublicConfig(): Promise<PublicConfig> {
  publicConfig ??= fetch(`${config.baseUrl}/api/public-config`)
    .then((r) => {
      if (!r.ok) throw new Error(`public-config failed (${r.status})`)
      return r.json() as Promise<PublicConfig>
    })
    .catch((e: unknown) => {
      publicConfig = null
      throw e
    })
  return publicConfig
}
