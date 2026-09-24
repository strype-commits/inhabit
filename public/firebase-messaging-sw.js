// Firebase Cloud Messaging service worker — deliberately dependency-free (no Firebase SDK):
// importScripts of the compat SDK can fail silently and stop the worker activating.
// Registered by the Firebase SDK at its own scope (/firebase-cloud-messaging-push-scope),
// separate from the Workbox PWA worker at /.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { /* not JSON */ }
  const n = payload.notification || {}
  const d = payload.data || {}
  event.waitUntil(self.registration.showNotification(n.title || d.title || 'inHabit', {
    body: n.body || d.body || '',
    icon: new URL('/maskable-512x512.png', self.location.origin).href,
    badge: new URL('/pwa-192x192.png', self.location.origin).href,
    tag: d.tag || undefined,            // same sensor + rule replaces rather than stacks
    data: { url: d.url || n.click_action || '/' }
  }))
})

// Focus an open app window and let the SPA route itself (this worker doesn't control
// app windows, so WindowClient.navigate() would throw); otherwise open a new window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || '/', self.location.origin)
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const appWindow = windows.find((w) => new URL(w.url).origin === target.origin)
    if (appWindow) {
      await appWindow.focus()
      appWindow.postMessage({ type: 'app-navigate', url: target.pathname + target.search })
    } else {
      await self.clients.openWindow(target.href)
    }
  })())
})
