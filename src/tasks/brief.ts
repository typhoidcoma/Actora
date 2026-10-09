import { useEffect, useState } from 'react'
import { config } from '../config'
import { llm, type LlmRequest } from '../aelora/http'
import type { Task } from '../aelora/protocol'

// A task with no notes is just a title. When one opens, Wendy writes a short
// brief for it (what it's about, why it matters now, the first step) from what
// she knows about the user. Cached per task, so it's written once, not on every
// open; a renamed or re-dated task gets a fresh one.

export const BRIEF_MARKER = 'BRIEF THIS TASK'
const KEY = 'actora.brief.v1'
const KEEP = 80

const SYSTEM = `You are Wendy, the user's personal agent, writing the "about" section for one of their tasks.
Write 2-3 short sentences, directly to the user: what this task is about (use what you know about them and their goals), why it matters now, and the concrete first step.
Plain text only: no greeting, no markdown, no lists, no headings. Don't invent specifics you don't know; when unsure, say what it likely involves.`

const signature = (t: Task) => `${t.id}|${t.title}|${t.due_date ?? ''}|${t.goal_id ?? ''}`

function readCache(): Record<string, { sig: string; text: string; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, { sig: string; text: string; at: number }>
  } catch {
    return {}
  }
}

function writeCache(id: string, sig: string, text: string) {
  try {
    const all = readCache()
    all[id] = { sig, text, at: Date.now() }
    const kept = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, KEEP)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* private mode: just regenerate next time */
  }
}

export function cachedBrief(t: Task): string | null {
  const hit = readCache()[t.id]
  return hit && hit.sig === signature(t) ? hit.text : null
}

export function briefRequest(t: Task, goalTitle: string | null, now = new Date()): LlmRequest {
  return {
    system: SYSTEM,
    prompt: [
      `${BRIEF_MARKER} (${now.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric' })}):`,
      `Title: "${t.title}"`,
      t.due_date ? `Due: ${t.due_date}` : 'No due date',
      t.estimated_minutes ? `Estimate: ${t.estimated_minutes} min` : null,
      goalTitle ? `Part of the goal: "${goalTitle}"` : null,
      `Status: ${t.status.replace('_', ' ')}`,
    ]
      .filter(Boolean)
      .join('\n'),
    maxTokens: 180,
    context: { profile: true, memoryQuery: t.title.slice(0, 200) },
  }
}

/** Clean up what came back: plain sentences, no wrapping quotes or stray markdown. */
export function tidyBrief(text: string): string {
  return (
    text
      .trim()
      // Only quotes wrapping the whole reply; a quoted title inside it stays.
      .replace(/^["“]([^"“”]*)["”]$/, '$1')
      .replace(/[*_#`]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600)
  )
}

/**
 * The brief for a task without notes: cached, or written now. Null text while
 * it's being written (or if it couldn't be); `skip` when the task has notes.
 */
export function useTaskBrief(
  task: Task | null,
  goalTitle: string | null,
  skip: boolean,
): { text: string | null; loading: boolean } {
  const sig = task ? signature(task) : ''
  // `done` marks a finished attempt (written or failed) so a failure isn't retried in a loop.
  const [state, setState] = useState<{ sig: string; text: string | null; done: boolean }>(() => ({
    sig,
    text: task ? cachedBrief(task) : null,
    done: false,
  }))
  // A different task (or the same one renamed): start from its cache.
  if (state.sig !== sig) setState({ sig, text: task ? cachedBrief(task) : null, done: false })

  const current = state.sig === sig
  const needed = !!task && !skip && current && !state.text && !state.done
  useEffect(() => {
    if (!needed || !task) return
    const ctrl = new AbortController()
    const req = briefRequest(task, goalTitle)
    const ask = config.mock ? import('../aelora/mock').then((m) => m.mockLlm(req, ctrl.signal)) : llm(req, ctrl.signal)
    ask
      .then((raw) => {
        const text = tidyBrief(raw)
        if (text) writeCache(task.id, sig, text)
        setState((s) => (s.sig === sig ? { sig, text: text || null, done: true } : s))
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState((s) => (s.sig === sig ? { ...s, done: true } : s))
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the task signature
  }, [needed, sig])

  return { text: current ? state.text : null, loading: needed }
}
