'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStore } from '../src/store'
import Splash from '../src/components/Splash'
import { supabase } from '../src/lib/supabase'
import { applyServer, cancelPush, decideSync, initStateSync, pickState, pullState, pushState, syncRecords } from '../src/lib/sync'

// 계정 전환 와이프 진행 중 — supabase가 INITIAL_SESSION·SIGNED_IN을 연달아 발화해 핸들러가
// 두 번 큐잉되므로, 두 번째 핸들러가 와이프 이후 가드를 통과해 이전 계정 데이터를 push하는 경합 차단
let wiping = false

// 대사 진행 표시(store.syncing) — INITIAL_SESSION·SIGNED_IN이 겹쳐 오므로 실행 수로 세고, 각 실행은 한 번만 내린다.
// 응답이 걸려도 5초 뒤엔 풀어 오프라인 우선 플레이를 막지 않는다
let syncs = 0
function beginSync(): () => void {
  if (syncs++ === 0) useStore.getState().setSyncing(true)
  let done = false
  const end = () => {
    if (done) return
    done = true
    clearTimeout(guard)
    if (--syncs === 0) useStore.getState().setSyncing(false)
  }
  const guard = setTimeout(end, 5000)
  return end
}

const TABS = [
  { to: '/', label: '홈', path: 'M4 11 L12 4 L20 11 V20 H14 V15 H10 V20 H4 Z' },
  { to: '/practice', label: '연습', path: 'M4 18 L9 12 L13 15 L20 7 M20 7 H15 M20 7 V12' },
  { to: '/history', label: '기록', path: 'M6 4 H18 V20 H6 Z M9 9 H15 M9 13 H15' },
  { to: '/more', label: '더보기', path: 'M5 12 H5.01 M12 12 H12.01 M19 12 H19.01' },
]

export default function Shell({ children }: { children: ReactNode }) {
  // 정적 export(trailingSlash)에선 pathname이 '/welcome/'처럼 옴 — 끝 슬래시 제거해 정확일치 유지
  const pathname = usePathname().replace(/(.)\/$/, '$1')
  const router = useRouter()
  // 시뮬/회고/스피드는 자체 하단 바 사용, 웰컴은 풀스크린 — 탭바 숨김
  const onSim = ['/sim', '/review', '/welcome', '/speed'].includes(pathname)
  const theme = useStore((s) => s.theme)

  // localStorage(zustand persist) 값은 서버 프리렌더와 어긋나므로 마운트 후에만 렌더
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // PWA/TWA — 오프라인 폴백·설치 요건용 최소 SW (public/sw.js). Capacitor(로컬 번들)에선 실패해도 무방
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  // 설치형 앱 콜드 스타트 브랜드 스플래시 — 실행(브라우저 세션)당 1회. /welcome(자체 스플래시)과
  // 웰컴 게이트로 갈 신규 유저는 제외해 이중 노출 방지
  const [splash, setSplash] = useState<'on' | 'off' | null>(null)
  useEffect(() => {
    try {
      if (!matchMedia('(display-mode: standalone)').matches || sessionStorage.getItem('charty:splashed')) return
      sessionStorage.setItem('charty:splashed', '1')
      const s = useStore.getState()
      const willWelcome = !s.welcomed && s.records.length === 0 && !s.activeSim
      if (window.location.pathname.startsWith('/welcome') || willWelcome) return
      setSplash('on')
    } catch { /* sessionStorage 접근 불가 환경 — 스플래시 생략 */ }
  }, [])
  useEffect(() => {
    if (!splash) return
    const t = setTimeout(() => setSplash(splash === 'on' ? 'off' : null), splash === 'on' ? 3000 : 700)
    return () => clearTimeout(t)
  }, [splash])

  // ponytail: 구 HashRouter URL(/#/sim) 리다이렉트 — 몇 달 뒤 삭제
  useEffect(() => {
    if (window.location.hash.startsWith('#/')) router.replace(window.location.hash.slice(1))
  }, [router])

  // R12 첫 방문 게이트 — 새 유저(기록·진행 세션 없음)만 웰컴으로. 홈 경로에서만 개입
  useEffect(() => {
    const s = useStore.getState()
    if (pathname === '/' && !s.welcomed && s.records.length === 0 && !s.activeSim) router.replace('/welcome')
  }, [pathname, router])

  // 수동 테마 선택 시 시스템 설정 대신 data-theme 속성으로 오버라이드
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [theme])

  // R11·R13 — 로그인(초기 세션 포함) 시 기록 대사 + state pull. setTimeout은 supabase 콜백 내 await 데드락 회피(공식 권고)
  useEffect(() => {
    if (!supabase) return
    initStateSync() // 변이 감지 → 디바운스 push 구독 (1회)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // 이 이벤트는 세션 만료·리프레시 실패로도 온다(auth-js가 _removeSession에서 발화). 그 경로엔
      // 사용자 확인도 플러시도 없고, 하필 오프라인이라 로컬이 유일본일 확률이 높다 — 그래서 여기선 안 지운다.
      // 자발적 로그아웃의 와이프·이동은 More의 로그아웃 버튼이 직접 한다 (동의를 받은 자리에서)
      if (event === 'SIGNED_OUT') localStorage.removeItem('charty:profile') // 프로필 미러 — 닉네임 잔존 방지
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return
      setTimeout(async () => {
        if (wiping) return
        let guestStamp = 0 // 게스트 → 계정 로그인이면 리셋 전 스탬프 — 행이 없을 때(새 계정) 시드에만 쓴다
        // 계정 전환 가드 — 이전 계정의 로컬 잔여 데이터가 새 계정 user_id로 push되기 전에 와이프.
        // 정상 로그아웃은 charty:uid를 지우므로 여기 안 걸린다(아래 게스트 → 계정 경로로 간다).
        // 세션이 SIGNED_OUT 없이 사라진 경우의 보험으로 남긴다. 같은 계정 재로그인은 기존처럼 병합
        if (session) {
          const prev = localStorage.getItem('charty:uid')
          if (prev && prev !== session.user.id) {
            wiping = true
            // reload의 내비게이션 커밋 전에 도착하는 늦은 set()이 persist를 재기록해도
            // 초기 상태만 남도록 스토어부터 리셋 (applyServer — 구독자의 스탬프·푸시 차단)
            applyServer(() => useStore.getState().wipeLocal())
            localStorage.setItem('charty:uid', session.user.id)
            location.reload()
            return
          }
          // 게스트(로그아웃 후·이 기기 첫 로그인) → 계정: 계정 우선 (2026-10-20 사용자 결정). 게스트 때 찍힌 스탬프가
          // LWW로 계정의 state 행(customs·진행 세션·잔고)을 덮지 않게 0으로 내리고, 예약된 게스트 push도 끊는다.
          // 행이 있으면 서버가 이기고, 없으면(새 계정) 리셋 전 스탬프로 시드해 게스트 상태를 이어받는다. 기록은 합집합.
          // 첫 await 전에 동기로 끝내야 INITIAL_SESSION·SIGNED_IN 두 번째 실행이 옛 스탬프로 비교하지 않는다
          // ponytail: pull이 실패한 채 변이가 생기면 그 스탬프가 계정 행을 이긴다(드묾) — 필요해지면 pull 성공 전까지 push 보류
          if (!prev) {
            guestStamp = useStore.getState().stateUpdatedAt
            cancelPush()
            applyServer(() => useStore.setState({ stateUpdatedAt: 0 }))
          }
          localStorage.setItem('charty:uid', session.user.id)
        }
        // await 재개마다 신원 재확인 — 대사 왕복 중에 로그아웃이 끼면 syncRecords의 merged가
        // (항상 로컬 스냅샷을 포함하므로) 방금 지운 계정 기록을 스토어·persist에 되살린다
        const uid = session?.user.id ?? null
        const stale = () => localStorage.getItem('charty:uid') !== uid
        // 대사 중엔 스피드 정산을 막는다 — 낡은 잔고 위의 탭이 새 스탬프로 다른 기기의 더 새 잔고를 덮지 않게
        const endSync = session ? beginSync() : () => {}
        try {
          const merged = await syncRecords(useStore.getState().records)
          if (stale()) return
          if (merged) applyServer(() => useStore.getState().applySync(merged))
          if (!session) return
          const pulled = await pullState()
          if (stale()) return
          useStore.getState().setSyncError(pulled === 'error')
          if (pulled === 'error') return
          const local = useStore.getState()
          const act = decideSync(local, pulled, guestStamp) // 규칙·근거는 sync.ts
          if (act === 'apply' && pulled) applyServer(() => local.applyState(pulled.data, pulled.updatedAt)) // 서버가 더 새로움
          else if (act === 'push') {
            // 로컬이 더 새로움 또는 행 없음 시드. 올린 스탬프를 로컬도 가져야 이후 LWW·로그아웃 비교가 맞는다
            const at = local.stateUpdatedAt || guestStamp || Date.now()
            applyServer(() => useStore.setState({ stateUpdatedAt: at }))
            void pushState(pickState(local), at)
          }
        } finally {
          endSync()
        }
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <div className="app">
      {splash && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <Splash hidden={splash === 'off'} onSkip={() => setSplash('off')} />
        </div>
      )}
      <main className={onSim ? 'content no-tab' : 'content'}>{mounted ? children : null}</main>
      {!onSim && (
        <nav className="tabbar">
          {TABS.map((t) => {
            const active = t.to === '/' ? pathname === '/'
              : pathname.startsWith(t.to) || (t.to === '/history' && pathname.startsWith('/report'))
            return (
              <Link key={t.to} href={t.to} className={active ? 'active' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.path} />
                </svg>
                <span>{t.label}</span>
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
