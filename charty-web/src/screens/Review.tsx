import { useState } from 'react'
import { Navigate, useNav } from '../lib/nav'
import { useStore } from '../store'
import { TF, fmtW, styleLabel } from '../lib/data'
import { reasonDist, sessionObservations, type Observation } from '../lib/report'

const EMOTIONS = [['😰', '불안함'], ['😬', '긴장됨'], ['😎', '자신감'], ['😢', '우울함'], ['😐', '무덤덤함']] as const

interface SessionReport {
  resultLine: string
  observations: Observation[]
  dist: { name: string; n: number }[]
}

export default function Review() {
  const nav = useNav()
  const { activeSim: sim, submitReview, waitlistAt, joinWaitlist } = useStore()
  const [emotion, setEmotion] = useState('')
  const [memo, setMemo] = useState('')
  // 저장 순간 sim이 비워지므로 리포트는 저장 직전에 계산해 로컬로 보관
  const [report, setReport] = useState<SessionReport | null>(null)

  // 저장 후: 세션 행동 리포트 (자동 이동 없음 — 읽고 직접 나간다)
  if (report) {
    return (
      <div className="page report-page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
          <span className="report-check">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 L9.5 18 L20 6.5" /></svg>
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>회고가 저장되었습니다</span>
        </div>
        <div className="dim num" style={{ fontSize: 12 }}>{report.resultLine}</div>

        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>이번 세션에서 관찰된 행동</div>
        {report.observations.map((ob) => (
          <div key={ob.text} className="card obs-card">
            <span className="obs-glyph">{ob.glyph}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{ob.text}</span>
              <span className="dim" style={{ fontSize: 11 }}>{ob.basis}</span>
            </div>
          </div>
        ))}
        {report.observations.length === 0 && (
          <div className="dim" style={{ fontSize: 12 }}>세션이 쌓이면 관찰이 늘어나요</div>
        )}

        {report.dist.length > 0 && (
          <div className="card" style={{ gap: 10 }}>
            <div className="dim" style={{ fontSize: 12, fontWeight: 600 }}>이번 세션 판단 근거</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {report.dist.map((d) => (
                <span key={d.name} className="dist-chip">{d.name} <b>{d.n}</b></span>
              ))}
            </div>
          </div>
        )}

        <div className="cta-card">
          <div style={{ fontSize: 15, fontWeight: 700 }}>이런 리포트를 매 세션 받아보세요</div>
          <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>누적 행동 분석과 맞춤 훈련 추천을 준비하고 있어요</div>
          {/* 가격 표시 제거(2026-08-15) — 유료화 신호는 아직 노출하지 않기로. 지불의사 측정은 신청 클릭(waitlistAt)만으로 */}
          <div className="dim" style={{ fontSize: 11 }}>출시 예정</div>
          <button className="pill pill-primary pill-full" style={{ marginTop: 8 }} disabled={!!waitlistAt} onClick={joinWaitlist}>
            {waitlistAt ? '신청 완료 ✓' : '미리 신청하기'}
          </button>
          <button className="cta-skip" onClick={() => nav('/', { replace: true })}>괜찮아요, 홈으로</button>
        </div>

        <div className="cta-bar" style={{ borderTop: '1px solid var(--hairline)' }}>
          <button className="pill pill-secondary pill-full" onClick={() => nav('/', { replace: true })}>홈으로</button>
        </div>
      </div>
    )
  }

  if (!sim || !sim.done) return <Navigate to="/" replace />

  const pnl = sim.cash - sim.startBalance
  const pnlPct = (pnl / sim.startBalance) * 100

  const submit = () => {
    if (!emotion) return
    setReport({
      resultLine: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% · 거래 ${sim.trades.length}회 · ${styleLabel(sim.style, sim.styleLabel)} · ${new Date().toLocaleDateString()}`,
      observations: sessionObservations(sim.trades, sim.events ?? [], TF[sim.timeframe].sec),
      dist: reasonDist(sim.trades),
    })
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
