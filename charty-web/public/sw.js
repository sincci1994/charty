// 최소 서비스워커 — 규칙 3개가 전부 (TWA 오프라인 dino 방지 + 설치 요건):
//   /_next/static/*  cache-first   (내용 해시 URL — 같은 URL은 영원히 같은 내용)
//   navigation(HTML)·캔들 JSON  network-first, 실패 시 캐시 폴백 (새 배포·매일 데이터 즉시 반영)
//   그 외 미개입 — 브라우저 HTTP 캐시로 충분. precache 없음(network-first 셸이라 무의미) → workbox 불필요
const CACHE = 'charty-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isStatic = (url) => url.pathname.startsWith('/_next/static/')
// 로컬 폴백(/data)과 Supabase Storage CDN 둘 다 — NEXT_PUBLIC_DATA_URL이 어느 쪽이든 매치
const isData = (url) => url.pathname.startsWith('/data/') || url.pathname.includes('/storage/v1/object/public/data/')

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (isStatic(url)) {
    e.respondWith(caches.open(CACHE).then(async (c) =>
      (await c.match(req)) ?? fetch(req).then((r) => {
        if (r.ok) c.put(req, r.clone())
        return r
      })))
  } else if (req.mode === 'navigate' || isData(url)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      try {
        const r = await fetch(req)
        if (r.ok) c.put(req, r.clone())
        return r
      } catch {
        // 오프라인 — 같은 URL의 마지막 응답, 내비게이션은 최후에 홈 셸이라도
        return (await c.match(req)) ?? (req.mode === 'navigate' && (await c.match('/'))) || Response.error()
      }
    }))
  }
})
