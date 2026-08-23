'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStore } from '../src/store'
import { START_BALANCE } from '../src/lib/data'
import { supabase } from '../src/lib/supabase'
import { applyServer, initStateSync, pickState, pullState, pushState, syncRecords } from '../src/lib/sync'

// 계정 전환 와이프 진행 중 — supabase가 INITIAL_SESSION·SIGNED_IN을 연달아 발화해 핸들러가
// 두 번 큐잉되므로, 두 번째 핸들러가 와이프 이후 가드를 통과해 이전 계정 데이터를 push하는 경합 차단
let wiping = false

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
  // 시뮬/회고는 자체 하단 바 사용, 웰컴은 풀스크린 — 탭바 숨김
  const onSim = ['/sim', '/review', '/welcome'].includes(pathname)
  const theme = useStore((s) => s.theme)

  // localStorage(zustand persist) 값은 서버 프리렌더와 어긋나므로 마운트 후에만 렌더
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // PWA/TWA — 오프라인 폴백·설치 요건용 최소 SW (public/sw.js). Capacitor(로컬 번들)에선 실패해도 무방
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

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
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return
      setTimeout(async () => {
        if (wiping) return
        // 계정 전환 가드 — 이전 계정의 로컬 잔여 데이터가 새 계정 user_id로 push되기 전에 와이프.
        // 로그아웃 시엔 안 지움(로그아웃 로컬 사용은 의도된 기능), 같은 계정 재로그인은 기존처럼 병합
        if (session) {
          const prev = localStorage.getItem('charty:uid')
          if (prev && prev !== session.user.id) {
            wiping = true
            // reload의 내비게이션 커밋 전에 도착하는 늦은 set()이 persist를 재기록해도
            // 초기 상태만 남도록 스토어부터 리셋 (applyServer — 구독자의 스탬프·푸시 차단)
            applyServer(() => useStore.setState({
              balance: START_BALANCE, activeSim: null, records: [], customs: [], candles: [],
              waitlistAt: null, welcomed: false, stateUpdatedAt: 0,
            }))
            localStorage.removeItem('charty')
            localStorage.setItem('charty:uid', session.user.id)
            location.reload()
            return
          }
          localStorage.setItem('charty:uid', session.user.id)
        }
        const merged = await syncRecords(useStore.getState().records)
        if (merged) applyServer(() => useStore.getState().applySync(merged))
        if (!session) return
        const pulled = await pullState()
        useStore.getState().setSyncError(pulled === 'error')
        if (pulled === 'error') return
        const local = useStore.getState()
        if (pulled && pulled.updatedAt > local.stateUpdatedAt) {
          applyServer(() => local.applyState(pulled.data, pulled.updatedAt)) // 서버가 더 새로움 — LWW 반영
        } else if (pulled && pulled.updatedAt < local.stateUpdatedAt) {
          void pushState(pickState(local), local.stateUpdatedAt) // 로그아웃·오프라인 중 변이 재푸시
        } else if (!pulled) {
          // 행 없음 — 기기 고유 상태(진행 세션·커스텀·게이트)가 있을 때만 시드.
          // balance는 records에서 파생 가능해 정보가 아님: 파생값만으로 행을 만들면
          // 새 기기의 빈 시드가 다른 기기의 실데이터(스탬프 0인 pre-R13 로컬)를 이겨버린다
          const slice = pickState(local)
          if (slice.activeSim || slice.customs.length > 0 || slice.welcomed || slice.waitlistAt != null)
            void pushState(slice, local.stateUpdatedAt || Date.now())
        }
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <div className="app">
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
