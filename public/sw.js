const CACHE = 'yuu-v1'
const SHELL = ['/login', '/prep', '/manifest.json', '/pwa-192x192.png', '/apple-touch-icon.png']

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  // Cache-first for static assets, network-first for API/Firebase
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) return
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res
      }).catch(() => cached)
      return cached || fetched
    })
  )
})
