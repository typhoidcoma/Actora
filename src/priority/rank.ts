import { agentName } from '../stores/agent'
import { LlmError, llm, type LlmRequest } from '../aelora/http'
import { config } from '../config'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { priorityStore, type RankEntry } from '../stores/priority'
import { useSky } from '../weather/sky'
import { scoreItems, type PriorityItem } from './score'

// The agent re-ranks the top candidates and writes a short "why now" for each,
// via Aelora's stateless POST /api/llm (grounded in the user's profile).

const CANDIDATES = 8
const DEBOUNCE_MS = 2000
const MIN_INTERVAL_MS = 2 * 60_000
const MAX_WHY = 60

const RANK_MARKER = 'RANK THESE CANDIDATES'

export function parseRanking(text: string, known: Set<string>): RankEntry[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
  let data: unknown
  try {
    data = JSON.parse(cleaned)
  } catch {
    return []
  }
  const list = Array.isArray(data) ? data : (data as { top?: unknown })?.top
  if (!Array.isArray(list)) return []
  const out: RankEntry[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const key = String((raw as { key?: unknown }).key ?? '')
    if (!known.has(key) || seen.has(key)) continue
    seen.add(key)
    const why = String((raw as { why?: unknown }).why ?? '').trim()
    out.push({ key, why: why && why.length <= MAX_WHY ? why : undefined })
    if (out.length === 3) break
  }
  return out
}

const system =
  () => `You are ${agentName()}, a warm personal assistant. Pick the three things the user should tackle first, in order, from the candidates.
Weigh real urgency (time, overdue, waiting on them) over busywork, and favour a sensible mix.
Return JSON only: {"top":[{"key":"<candidate key>","why":"<why now, at most ${MAX_WHY} characters, your voice, no emoji>"}]}
Use only the given keys.`

function buildRankRequest(candidates: PriorityItem[], now = new Date()): LlmRequest {
  const sky = useSky.getState()
  const lines = candidates.map((c) => `- key: ${c.key} | ${c.kind} | "${c.title}" | ${c.meta} | ${c.why}`)
  return {
    system: system(),
    prompt: [
      `${RANK_MARKER} (${now.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}${
        sky.source === 'live' && sky.temp !== null ? `, ${Math.round(sky.temp)}°${sky.unit} ${sky.kind}` : ''
      }):`,
      ...lines,
    ].join('\n'),
    json: true,
    maxTokens: 250,
    context: { profile: true },
  }
}

/** Watches the data; when the candidate set changes, asks the agent to re-rank (throttled, cached, 429-aware). */
export function startRanking(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let inflight: AbortController | null = null
  let lastSig = ''
  let lastRun = 0
  let pausedUntil = 0
  const cache = new Map<string, RankEntry[]>()

  const run = async () => {
    if (useAgent.getState().connection !== 'open') return
    const candidates = scoreItems(useEntities.getState(), Date.now()).slice(0, CANDIDATES)
    if (candidates.length < 2) return priorityStore.setAgent(null)
    const sig = candidates.map((c) => c.key).join('|')
    if (sig === lastSig) return
    const hit = cache.get(sig)
    if (hit) {
      lastSig = sig
      return priorityStore.setAgent(hit)
    }
    const now = Date.now()
    const wait = Math.max(lastRun + MIN_INTERVAL_MS, pausedUntil) - now
    if (wait > 0) {
      clearTimeout(timer)
      timer = setTimeout(() => void run(), wait)
      return
    }
    lastSig = sig
    lastRun = now
    inflight?.abort()
    const ctrl = new AbortController()
    inflight = ctrl
    const req = buildRankRequest(candidates)
    try {
      const text = config.mock
        ? await (await import('../aelora/mock')).mockLlm(req, ctrl.signal)
        : await llm(req, ctrl.signal)
      if (ctrl.signal.aborted) return
      const ranking = parseRanking(text, new Set(candidates.map((c) => c.key)))
      if (ranking.length) {
        cache.set(sig, ranking)
        priorityStore.setAgent(ranking)
      }
    } catch (e) {
      if (ctrl.signal.aborted) return
      if (e instanceof LlmError && e.status === 429) pausedUntil = Date.now() + (e.retryAfterMs ?? 30_000)
      lastSig = ''
    } finally {
      if (inflight === ctrl) inflight = null
    }
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), DEBOUNCE_MS)
  }
  const offE = useEntities.subscribe(schedule)
  const offA = useAgent.subscribe((s, p) => s.connection === 'open' && p.connection !== 'open' && schedule())
  schedule()
  return () => {
    clearTimeout(timer)
    inflight?.abort()
    offE()
    offA()
    priorityStore.setAgent(null)
  }
}
