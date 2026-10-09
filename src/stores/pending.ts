import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { sayOption, type Option } from '../options/types'
import { toast } from './toast'

/**
 * Things Wendy has prepared that wait for the user's OK: an email draft, an
 * invite, a filter… (Aelora's gated tools → `pending_action` events). The server
 * only carries one out when the user approves in a later message, so the
 * buttons here send that message; they never act directly.
 */
export interface PendingAction {
  id: string
  kind: string
  summary: string
  status: 'waiting' | 'retryable'
  at: number
}

const DAY = 24 * 60 * 60_000

interface PendingState {
  items: Record<string, PendingAction>
}

export const usePending = create<PendingState>(() => ({ items: {} }))

/** The newest thing Wendy prepared that waits for the user's OK (or none). */
export function usePendingAction(): PendingAction | undefined {
  return usePending(useShallow((s) => waiting(s.items)[0]))
}

/** What each kind is, in words, and what "yes" does. */
export const KINDS: Record<string, { label: string; yes: string; done: string }> = {
  send_email: { label: 'Email ready to send', yes: 'Send it', done: 'Email sent' },
  send_invite: { label: 'Invite ready to send', yes: 'Send invite', done: 'Invite sent' },
  update_invite: { label: 'Meeting change', yes: 'Send update', done: 'Guests updated' },
  cancel_invite: { label: 'Cancel a meeting', yes: 'Cancel it', done: 'Meeting cancelled' },
  trash: { label: 'Move to trash', yes: 'Trash them', done: 'Moved to trash' },
  spam: { label: 'Mark as spam', yes: 'Mark spam', done: 'Marked as spam' },
  create_filter: { label: 'New email filter', yes: 'Create it', done: 'Filter created' },
  delete_filter: { label: 'Delete a filter', yes: 'Delete it', done: 'Filter deleted' },
  set_vacation: { label: 'Out-of-office reply', yes: 'Turn it on', done: 'Auto-reply set' },
}
export const kindOf = (kind: string) => KINDS[kind] ?? { label: 'Waiting for your OK', yes: 'Go ahead', done: 'Done' }

/** Waiting actions, newest first (expired ones dropped: the server drops them after a day). */
export function waiting(items: Record<string, PendingAction>, now = Date.now()): PendingAction[] {
  return Object.values(items)
    .filter((p) => now - p.at < DAY)
    .sort((a, b) => b.at - a.at)
}

export const pending = {
  /** One `pending_action` event: created / retryable / done / failed / discarded. */
  apply(data: Record<string, unknown>) {
    const id = typeof data.id === 'string' ? data.id : null
    if (!id) return
    const type = String(data.type ?? '').replace(/^pending_action:/, '')
    const kind = typeof data.kind === 'string' ? data.kind : (usePending.getState().items[id]?.kind ?? '')
    const drop = () =>
      usePending.setState((s) => {
        const items = { ...s.items }
        delete items[id]
        return { items }
      })
    switch (type) {
      case 'created':
        usePending.setState((s) => ({
          items: {
            ...s.items,
            [id]: {
              id,
              kind,
              summary: typeof data.summary === 'string' ? data.summary : '',
              status: 'waiting',
              at: Date.now(),
            },
          },
        }))
        return
      case 'retryable':
        if (usePending.getState().items[id])
          usePending.setState((s) => ({ items: { ...s.items, [id]: { ...s.items[id], status: 'retryable' } } }))
        return
      case 'done':
        drop()
        toast.show(kindOf(kind).done)
        return
      case 'failed':
        drop()
        toast.error(`${kindOf(kind).label}: that didn't go through.`)
        return
      case 'discarded':
        drop()
        return
    }
  },
  clear: () => usePending.setState({ items: {} }),
}

/**
 * The answer pills for the newest waiting action. Each one is a message from
 * the user (the server requires approval in a later turn), naming the action so
 * Wendy confirms the right one.
 */
export function approvalOptions(p: PendingAction | undefined): Option[] {
  if (!p) return []
  const k = kindOf(p.kind)
  return [
    sayOption(p.status === 'retryable' ? 'Try again' : k.yes, `Yes, go ahead (action ${p.id}).`, 'pushed'),
    sayOption('Change it', "Let's change that before it goes.", 'pushed'),
    sayOption('Discard', `Discard that (action ${p.id}).`, 'pushed'),
  ].map((o) => ({ ...o, id: `approve:${p.id}:${o.label}` }))
}
