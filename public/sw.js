// Push transport only (Aelora docs/PUSH.md §2). No fetch handler, no caching.
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* malformed payload: still show something */
  }
  // Always show a notification: browsers penalise silent pushes.
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wendy', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url || '/', notificationId: data.notificationId },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url = '/', notificationId } = event.notification.data || {}
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', notificationId, url })
          return client.focus()
        }
      }
      const target = new URL(url, self.location.origin)
      if (notificationId) target.searchParams.set('notification', notificationId)
      return self.clients.openWindow(target.href)
    })(),
  )
})
