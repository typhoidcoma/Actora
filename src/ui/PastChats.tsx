import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { deleteThread, listThreads, newThread, openThread, type ThreadSummary } from '../aelora/client'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { ago } from './format'
import { morph, press } from './motion'

/** Menu → Past chats: earlier conversations with the agent, newest first; open one, delete one, or start fresh. */
export function PastChats() {
  const open = useUi((s) => s.pastChats)
  return <AnimatePresence>{open && <Sheet key="past" />}</AnimatePresence>
}

function Sheet() {
  const m = useMetrics()
  const current = useAgent((s) => s.conversationId)
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const w = Math.min(m.vw - 24, 560)
  const h = Math.min(m.vh - 120, 620)
  const close = () => ui.pastChats(false)

  // One page at a time (a double tap on "Show older" must not load it twice).
  const [loading, setLoading] = useState(false)
  const load = (before?: string) => {
    if (loading) return
    setLoading(true)
    void listThreads(before).then((r) => {
      setLoading(false)
      if (!r) return setFailed(true)
      setThreads((cur) => {
        const have = new Set((before ? (cur ?? []) : []).map((t) => t.id))
        return [...(before ? (cur ?? []) : []), ...r.threads.filter((t) => !have.has(t.id))]
      })
      setNext(r.next)
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- first page once, on open
  useEffect(() => load(), [])
  // An unanswered "Delete chat" goes back to plain Delete.
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(null), 4000)
    return () => clearTimeout(t)
  }, [confirm])

  const remove = async (id: string) => {
    setConfirm(null)
    if (!(await deleteThread(id))) return
    setThreads((cur) => cur?.filter((t) => t.id !== id) ?? null)
    // The chat being shown is gone: start fresh rather than keep talking into it.
    if (id === current) newThread(false)
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Past chats"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={morph}
        className="glass glass-thick fixed z-50 flex flex-col p-4"
        style={{ left: (m.vw - w) / 2, top: (m.vh - h) / 2, width: w, height: h, borderRadius: 10 }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="display text-[24px] text-strong">Past chats</h2>
          <motion.button
            whileTap={press}
            onClick={() => {
              close()
              newThread()
            }}
            className="h-11 rounded-[8px] bg-fill px-4 text-[14px] font-semibold text-on-accent"
          >
            New chat
          </motion.button>
        </div>
        <div className="scroll-y min-h-0 flex-1">
          {failed && <p className="py-8 text-center text-muted">Couldn't load your chats. Try again in a moment.</p>}
          {!failed && threads === null && (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="shimmer h-14 rounded-[6px] bg-text/6" />
              ))}
            </div>
          )}
          {threads?.length === 0 && <p className="py-8 text-center text-muted">No earlier chats yet.</p>}
          <ul>
            {threads?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 border-b border-line last:border-0">
                <button
                  onClick={() => {
                    close()
                    // The current one is already loaded: just show it (don't reload it mid-turn).
                    if (t.id === current) ui.openChat()
                    else openThread(t.id)
                  }}
                  className="min-w-0 flex-1 py-3 text-left"
                >
                  <span className="block truncate text-[16px] text-strong">
                    {t.title ?? 'Untitled chat'}
                    {t.id === current && <span className="ml-2 text-xs font-semibold text-accent">Current</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {t.messageCount} message{t.messageCount === 1 ? '' : 's'}
                    {t.lastMessageAt ? ` · ${ago(t.lastMessageAt)}` : ''}
                  </span>
                </button>
                <button
                  onClick={() => (confirm === t.id ? void remove(t.id) : setConfirm(t.id))}
                  className={`h-11 shrink-0 rounded-[6px] px-3 text-[13px] font-semibold ${confirm === t.id ? 'bg-urgent text-white' : 'text-muted hover:text-urgent'}`}
                >
                  {confirm === t.id ? 'Delete chat' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
          {next && (
            <div className="flex justify-center py-3">
              <button
                onClick={() => load(next)}
                disabled={loading}
                className="glass-pill h-11 rounded-[8px] px-4 text-[14px] font-medium text-muted"
              >
                Show older
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
