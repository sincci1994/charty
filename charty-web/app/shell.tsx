'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStore } from '../src/store'

const TABS = [
  { to: '/', label: '홈', path: 'M4 11 L12 4 L20 11 V20 H14 V15 H10 V20 H4 Z' },
  { to: '/practice', label: '연습', path: 'M4 18 L9 12 L13 15 L20 7 M20 7 H15 M20 7 V12' },
  { to: '/history', label: '기록', path: 'M6 4 H18 V20 H6 Z M9 9 H15 M9 13 H15' },
  { to: '/more', label: '더보기', path: 'M5 12 H5.01 M12 12 H12.01 M19 12 H19.01' },
]

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  // 시뮬/회고 화면은 자체 하단 바(트레이드 바·CTA 바)를 사용
  const onSim = ['/sim', '/review'].includes(pathname)
  const theme = useStore((s) => s.theme)

  // localStorage(zustand persist) 값은 서버 프리렌더와 어긋나므로 마운트 후에만 렌더
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ponytail: 구 HashRouter URL(/#/sim) 리다이렉트 — 몇 달 뒤 삭제
  useEffect(() => {
    if (window.location.hash.startsWith('#/')) router.replace(window.location.hash.slice(1))
  }, [router])

  // 수동 테마 선택 시 시스템 설정 대신 data-theme 속성으로 오버라이드
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [theme])

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
