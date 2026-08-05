import { useEffect, useState } from 'react'
import { Navigate, useNav } from '../lib/nav'
import { useStore } from '../store'
import { fmtW, styleLabel } from '../lib/data'

const EMOTIONS = [['😰', '불안함'], ['😬', '긴장됨'], ['😎', '자신감'], ['😢', '우울함'], ['😐', '무덤덤함']] as const

export default function Review() {
  const nav = useNav()
  const { activeSim: sim, submitReview } = useStore()
  const [emotion, setEmotion] = useState('')
  const [memo, setMemo] = useState('')
  const [saved, setSaved] = useState(false)

  // 저장 후 스플래시 → 잠시 뒤 홈으로
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => nav('/', { replace: true }), 1800)
    return () => clearTimeout(id)
  }, [saved, nav])

  if (saved) {
    return (
      <div className="splash">
        <div className="splash-check">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 L10 17.5 L19 7" strokeDasharray="48" style={{ animation: 'checkDraw 0.45s ease-out 0.3s both' }} />
          </svg>
        </div>
        <div className="center" style={{ animation: 'fadeUp 0.4s ease-out 0.5s both' }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.374px' }}>회고가 저장되었습니다!</div>
          <div className="dim" style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>잠시 후 홈으로<br />자동 이동됩니다</div>
        </div>
      </div>
    )
  }

  if (!sim || !sim.done) return <Navigate to="/" replace />

  const pnl = sim.cash - sim.startBalance
  const pnlPct = (pnl / sim.startBalance) * 100

  const submit = () => {
    if (!emotion) return
    setSaved(true)
    submitReview(emotion, memo.trim())
  }

  return (
    <div className="page" style={{ paddingBottom: 130 }}>
      <h2 style={{ padding: '12px 4px 0' }}>회고 작성</h2>

      <div className="card center">
        <div className="dim small" style={{ fontSize: 13 }}>{sim.symbol} 연습 결과 · {styleLabel(sim.style, sim.styleLabel)}</div>
        <div className={`num ${pnl >= 0 ? 'green' : 'red'}`} style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px' }}>
          {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
        </div>
        <div className="dim num" style={{ fontSize: 13 }}>
          {fmtW(sim.startBalance)} → {fmtW(sim.cash)} · 거래 {sim.trades.length}회
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', margin: '14px 0 0' }}>
        이 거래를 진행하면서 어떤 기분이 들었나요?
      </div>
      <div className="emotion-grid">
        {EMOTIONS.map(([icon, label]) => {
          const key = `${icon} ${label}`
          return (
            <button
              key={key}
              className={emotion === key ? 'emotion selected' : 'emotion'}
              onClick={() => setEmotion(emotion === key ? '' : key)}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>{label}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', margin: '14px 0 0' }}>
        매매 기록을 작성해주세요
      </div>
      <textarea
        placeholder="왜 그렇게 매매했나요? 잘한 점과 아쉬운 점을 기록해보세요."
        maxLength={500}
        rows={6}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        style={{ background: 'var(--card)', border: '1px solid var(--hairline)', borderRadius: 14, lineHeight: 1.6, padding: '14px 16px' }}
      />
      <div className="dim num" style={{ fontSize: 12, textAlign: 'right' }}>({memo.length}/500자)</div>

      <div className="cta-bar">
        <button className="pill pill-primary pill-full" disabled={!emotion} onClick={submit}>
          Complete Reflection
        </button>
        <div className="dim center" style={{ fontSize: 12, marginTop: 8, height: 15 }}>
          {emotion ? '' : '감정을 선택해주세요'}
        </div>
      </div>
    </div>
  )
}
