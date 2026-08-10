import { useEffect } from 'react'
import { useNav } from '../lib/nav'
import { useStore } from '../store'
import { useSession } from '../lib/supabase'
import AuthButtons from '../components/AuthButtons'

// R12 첫 방문 웰컴 — 로그인 유도하되 Local-first 원칙대로 [로그인 없이 둘러보기] 항상 열어둠.
// 기록이 있는 기존 유저는 shell의 게이트가 애초에 이 화면으로 보내지 않는다.

const POINTS = [
  ['📈', '티커·날짜를 가린 과거 차트로 실전처럼 매매 연습'],
  ['📝', '주문마다 판단 이유를 기록하고 행동 리포트로 복기'],
  ['☁️', '로그인하면 기록이 계정에 저장되어 어느 기기에서든 이어짐'],
] as const

export default function Welcome() {
  const nav = useNav()
  const session = useSession()
  const setWelcomed = useStore((s) => s.setWelcomed)

  // 이미 로그인된 상태로 진입하면 웰컴은 볼 이유가 없다
  useEffect(() => {
    if (session) {
      setWelcomed()
      nav('/', { replace: true })
    }
  }, [session, setWelcomed, nav])

  return (
    <div className="page" style={{ minHeight: '100dvh', justifyContent: 'center', gap: 0, paddingBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' }}>차티</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #1fb6ff, #3d5cff)', borderRadius: 999, padding: '3px 9px' }}>베타</span>
      </div>
      <div className="dim center" style={{ fontSize: 14, marginTop: 6 }}>차트 감각은 타고나는 게 아니라 훈련됩니다</div>

      <div className="card" style={{ marginTop: 26, gap: 14, padding: '18px 16px' }}>
        {POINTS.map(([emoji, text]) => (
          <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16 }}>{emoji}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        <AuthButtons redirectPath="/profile" beforeSignIn={setWelcomed} />
        <button
          className="dim"
          style={{ background: 'transparent', fontSize: 13, padding: '10px 0', textDecoration: 'underline', textUnderlineOffset: 3 }}
          onClick={() => {
            setWelcomed()
            nav('/', { replace: true })
          }}
        >
          로그인 없이 둘러보기
        </button>
      </div>
    </div>
  )
}
