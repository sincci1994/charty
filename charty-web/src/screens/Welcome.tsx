import { useEffect, useState } from 'react'
import { useNav } from '../lib/nav'
import { useStore } from '../store'
import { supabase, useSession } from '../lib/supabase'
import Splash from '../components/Splash'

// Launch 화면 (디자인 원본 Launch.dc.html) — 스플래시 3.8초(탭 스킵) → 시작 화면.
// Local-first 원칙 유지: [바로 시작하기]가 1순위, 로그인은 Google만(카카오는 활성화 시 재노출, Apple은 iOS 트랙 때).
// 기록 있는 기존 유저는 shell 게이트가 이 화면으로 보내지 않는다.

const pill: React.CSSProperties = {
  borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 8, cursor: 'pointer', width: '100%', fontFamily: 'inherit',
}

export default function Welcome() {
  const nav = useNav()
  const session = useSession()
  const setWelcomed = useStore((s) => s.setWelcomed)
  const [phase, setPhase] = useState<'splash' | 'start'>('splash')

  // 이미 로그인된 상태로 진입하면 웰컴은 볼 이유가 없다
  useEffect(() => {
    if (session) {
      setWelcomed()
      nav('/', { replace: true })
    }
  }, [session, setWelcomed, nav])

  useEffect(() => {
    const t = setTimeout(() => setPhase('start'), 3800)
    return () => clearTimeout(t)
  }, [])

  const start = () => {
    setWelcomed()
    nav('/', { replace: true })
  }
  const google = () => {
    setWelcomed()
    supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/profile` } })
  }

  const sp = phase === 'splash'
  return (
    <div style={{ minHeight: '100dvh', position: 'relative', overflow: 'hidden', background: 'radial-gradient(130% 100% at 50% 0%, #101838 0%, #0A0F26 48%, #06081A 100%)' }}>
      {/* 시작 화면 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '0 24px calc(30px + env(safe-area-inset-bottom))',
        opacity: sp ? 0 : 1, transform: sp ? 'translateY(26px)' : 'translateY(0)',
        transition: 'opacity 0.65s ease 0.12s, transform 0.7s cubic-bezier(0.2,0.7,0.2,1) 0.12s',
        pointerEvents: sp ? 'none' : 'auto',
      }}>
        <div style={{ position: 'absolute', top: -60, left: -70, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(31,182,255,0.16), transparent 70%)', filter: 'blur(30px)', animation: 'chFloat 7s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', top: 130, right: -90, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(155,47,248,0.13), transparent 70%)', filter: 'blur(34px)', animation: 'chFloat 9s ease-in-out infinite alternate-reverse' }} />

        <div style={{ flex: '0 0 15%' }} />
        <img src="/logo-mark.png" alt="Charty 로고" style={{ width: 104, height: 104, filter: 'drop-shadow(0 12px 34px rgba(61,92,255,0.45))', position: 'relative' }} />
        <div style={{ fontSize: 33, fontWeight: 800, letterSpacing: '-0.5px', color: '#F5F7FF', marginTop: 22, position: 'relative' }}>Charty</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#8A93BE', marginTop: 9, textAlign: 'center', position: 'relative', textWrap: 'pretty' }}>실제 과거 차트로 연습하는 매매 시뮬레이션</div>
        <div style={{ flex: 1 }} />

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
          <div>
            <button onClick={start} style={{ ...pill, height: 54, border: 'none', background: 'linear-gradient(135deg, #1FB6FF 0%, #3D5CFF 55%, #9B2FF8 100%)', boxShadow: '0 10px 28px rgba(61,92,255,0.35)', color: '#fff', fontSize: 16, fontWeight: 700 }}>
              바로 시작하기
            </button>
            <div style={{ fontSize: 12, color: '#8A93BE', textAlign: 'center', marginTop: 9 }}>가입 없이 시작해요 · 기록은 이 기기에 저장돼요</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(138,155,255,0.16)' }} />
            <span style={{ fontSize: 11, color: '#6C7396' }}>또는</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(138,155,255,0.16)' }} />
          </div>
          <button onClick={google} style={{ ...pill, height: 50, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(138,155,255,0.2)', color: '#F2F4FF', fontSize: 15, fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"></path><path fill="#34A853" d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"></path><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"></path><path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"></path></svg>
            Google로 계속하기
          </button>
        </div>

        <div style={{ fontSize: 11, lineHeight: 1.6, color: '#5F6683', textAlign: 'center', marginTop: 18, position: 'relative', maxWidth: 300, textWrap: 'pretty' }}>
          시작하면 <span onClick={() => nav('/privacy')} style={{ textDecoration: 'underline', color: '#8FA0D8', cursor: 'pointer' }}>개인정보 처리방침</span>에 동의한 것으로 봐요
        </div>
      </div>

      {/* 스플래시 페이즈 — hidden 전환으로 페이드아웃 */}
      <Splash hidden={!sp} onSkip={() => setPhase('start')} />
    </div>
  )
}
