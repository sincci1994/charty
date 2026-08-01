import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store'

const EMOTIONS = ['😰 불안함', '😬 긴장됨', '😎 자신감', '😢 우울함', '😐 무덤덤함']

export default function Review() {
  const nav = useNavigate()
  const { activeSim: sim, submitReview } = useStore()
  const [emotion, setEmotion] = useState('')
  const [memo, setMemo] = useState('')

  if (!sim || !sim.done) return <Navigate to="/" replace />

  const pnl = sim.cash - sim.startBalance
  const pnlPct = (pnl / sim.startBalance) * 100

  const submit = () => {
    if (!emotion) { alert('감정을 선택해주세요'); return }
    submitReview(emotion, memo.trim())
    nav('/', { replace: true })
  }

  return (
    <div className="page">
      <h2>회고</h2>
      <div className="card center">
        <div className="dim small">{sim.symbol} 연습 결과</div>
        <div className={`big-number ${pnl >= 0 ? 'green' : 'red'}`}>
          {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
        </div>
        <div className="dim">
          {sim.startBalance.toLocaleString()} → {sim.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          {' · '}거래 {sim.trades.length}회
        </div>
      </div>

      <div className="card">
        <div className="dim small">이번 연습에서 느낀 감정은?</div>
        <div className="emotion-grid">
          {EMOTIONS.map((e) => (
            <button key={e} className={emotion === e ? 'emotion selected' : 'emotion'} onClick={() => setEmotion(e)}>
              {e}
            </button>
          ))}
        </div>
        <textarea
          placeholder="왜 그렇게 매매했나요? 잘한 점과 아쉬운 점을 기록해보세요. (500자)"
          maxLength={500}
          rows={5}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <button className="primary-btn big" onClick={submit}>기록하고 마치기</button>
      </div>
    </div>
  )
}
