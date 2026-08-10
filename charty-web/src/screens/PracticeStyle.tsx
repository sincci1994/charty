import { useState } from 'react'
import { Navigate, useNav } from '../lib/nav'
import type { Style } from '../types'
import { STYLES, TF, barsFor, estTime } from '../lib/data'
import { useStore } from '../store'

export default function PracticeStyle() {
  const nav = useNav()
  const { activeSim, startSim, customs } = useStore()
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<string | null>(null)

  // 진행중 세션이 있으면 새 시작 불가 — 연습 탭 게이트에서 그만두기 먼저
  // (loading 중엔 startSim 직후 activeSim이 생기며 리렌더되므로 가드 제외, nav('/sim')이 이어짐)
  if (activeSim && !loading) return <Navigate to="/practice" replace />

  const start = async () => {
    if (!sel) return
    setLoading(true)
    try {
      await startSim(sel)
      nav('/sim')
      // 성공 시 loading을 풀지 않음 — 풀면 /sim 전환(transition)보다 먼저 리렌더되어 위 가드가 /practice로 덮어씀
    } catch (e) {
      alert(e instanceof Error ? e.message : '시작 실패')
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 0' }}>
        <button className="back-btn" onClick={() => nav('/practice')} aria-label="뒤로">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6 L9 12 L15 18" /></svg>
        </button>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.374px' }}>트레이딩 스타일 선택</div>
      </header>
      <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, letterSpacing: '-0.1px' }}>
        투자 기간은 해당 기간 내 거래 종료를 목표로 하며, 시간 단위는 트레이딩 시 사용할 캔들의 시간 단위를 의미합니다
      </p>

      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 8 }}>기본 트레이딩 스타일</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(Object.keys(STYLES) as Style[]).map((key) => (
          <button key={key} className={`style-card${sel === key ? ' selected' : ''}`} disabled={loading} onClick={() => setSel(key)}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{STYLES[key].label}</div>
              <div className="dim" style={{ fontSize: 13, marginTop: 3 }}>
                거래 기간 {STYLES[key].period} · 차트 간격 {TF[STYLES[key].tf].label} · {estTime(STYLES[key].bars)} 소요
              </div>
            </div>
            <div className="radio">
              {sel === key && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 8 }}>커스텀 스타일</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {customs.map((c) => (
          // div — 설정 pill이 안에 있어 button 중첩 불가
          <div key={c.id} className={`style-card${sel === c.id ? ' selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => !loading && setSel(c.id)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{c.name}</div>
              <div className="dim" style={{ fontSize: 13, marginTop: 3 }}>
                거래 기간 {c.periodValue}{c.periodUnit} · 차트 간격 {TF[c.tf].label} · {estTime(barsFor(c))} 소요
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); nav(`/practice/style/custom/${c.id}`) }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '5px 12px' }}
            >
              설정
            </button>
            <div className="radio">
              {sel === c.id && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
              )}
            </div>
          </div>
        ))}
        <button className="dim" style={{ background: 'transparent', border: '1.5px dashed var(--hairline)', borderRadius: 16, padding: '16px 18px', fontSize: 14 }} onClick={() => nav('/practice/style/custom')}>
          + 새 커스텀 스타일 추가
        </button>
      </div>

      {/* ponytail: 디자인의 fixed 하단 CTA 바는 플로팅 탭바와 겹쳐 생략 — 페이지 흐름 내 배치 */}
      <button className={`pill pill-full pill-primary cta${loading ? ' pulse' : ''}`} style={{ marginTop: 12 }} disabled={!sel || loading} onClick={start}>
        시뮬레이션 시작
      </button>
      {!sel && <div className="dim center" style={{ fontSize: 12 }}>트레이딩 스타일을 선택해주세요</div>}
    </div>
  )
}
