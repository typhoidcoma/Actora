import { markNotificationRead } from '../aelora/client'
import { showThread } from '../social/social'
import { useEntities } from '../stores/entities'
import { ui } from '../stores/ui'
import { initPush, setNotificationOpener } from './push'

/** Lock-screen tap on a reminder: open it on its card and mark it read once data is in. */
function openNotification(id: string): void {
  ui.open({ kind: 'notification', id })
  const tryMark = () => {
    const n = useEntities.getState().notifications[id]
    if (!n) return false
    if (!n.read_at) void markNotificationRead(id)
    return true
  }
  if (tryMark()) return
  const off = useEntities.subscribe(() => tryMark() && off())
}

/**
 * Push for either app (2D Stage, 3D App): register the worker and learn where we
 * stand (never prompts), and route a tapped notification. A reminder opens on
 * its card; a direct message opens its conversation in People.
 */
export function startPush(): () => void {
  void initPush()
  return setNotificationOpener((o) => (o.kind === 'dm' ? showThread(o.id) : openNotification(o.id)))
}
