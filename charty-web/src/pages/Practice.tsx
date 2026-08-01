import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Style } from '../types'
import { STYLES } from '../lib/data'
import { useStore } from '../store'

export default function Practice() {
  const nav = useNavigate()
  const { activeSim, startSim } = useStore()
  const [loading, setLoading] = useState(false)

  const start = async (style: Style) => {
    if (activeSim && !confirm('진행중인 시뮬레이션이 있습니다. 버리고 새로 시작할까요?')) {
      nav('/sim')
      return
    }
    setLoading(true)
    try {
      await startSim(style)
      nav('/sim')
    } catch (e) {
      alert(e instanceof Error ? e.message : '시작 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h2>연습</h2>
      <p className="dim">트레이딩 스타일을 고르면 랜덤 종목·랜덤 구간으로 시작합니다.</p>
      {activeSim && (
        <button className="primary-btn big" onClick={() => nav('/sim')}>진행중인 연습 이어하기 ▶</button>
      )}
      {(Object.keys(STYLES) as Style[]).map((key) => (
        <button key={key} className="card style-card" disabled={loading} onClick={() => start(key)}>
          <b>{STYLES[key].label}</b>
          <span className="dim">{STYLES[key].desc}</span>
        </button>
      ))}
    </div>
  )
}
