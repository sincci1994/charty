import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { Style } from '../types'
import { STYLES } from '../lib/data'
import { useStore } from '../store'

export default function PracticeStyle() {
  const nav = useNavigate()
  const { activeSim, startSim } = useStore()
  const [loading, setLoading] = useState(false)

  // 진행중 세션이 있으면 새 시작 불가 — 연습 탭 게이트에서 그만두기 먼저
  // (loading 중엔 startSim 직후 activeSim이 생기며 리렌더되므로 가드 제외, nav('/sim')이 이어짐)
  if (activeSim && !loading) return <Navigate to="/practice" replace />

  const start = async (style: Style) => {
    setLoading(true)
    try {
      await startSim(style)
      nav('/sim')
      // 성공 시 loading을 풀지 않음 — 풀면 /sim 전환(transition)보다 먼저 리렌더되어 위 가드가 /practice로 덮어씀
    } catch (e) {
      alert(e instanceof Error ? e.message : '시작 실패')
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h2>스타일 선택</h2>
      <p className="dim">트레이딩 스타일을 고르면 랜덤 종목·랜덤 구간으로 시작합니다.</p>
      {(Object.keys(STYLES) as Style[]).map((key) => (
        <button key={key} className="card style-card" disabled={loading} onClick={() => start(key)}>
          <b>{STYLES[key].label}</b>
          <span className="dim">{STYLES[key].desc}</span>
        </button>
      ))}
    </div>
  )
}
