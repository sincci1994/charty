import { useNav } from '../lib/nav'
import { useStore } from '../store'
import { NEED_SESSIONS, cumulativeReport, type Metric } from '../lib/report'

const Lock = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11 V7 a4 4 0 0 1 8 0 v4" />
  </svg>
)

const TONE: Record<NonNullable<Metric['tone']>, string> = {
  up: 'var(--green)',
  down: 'var(--red)',
  accent: 'var(--accent)',
  text: 'var(--text)',
}

const TEASERS = ['감정별 성과 분석', '맞춤 훈련 추천']

export default function Report() {
  const nav = useNav()
  const records = useStore((s) => s.records)
  const { judged, legacy, metrics } = cumulativeReport(records)
  const fullLock = judged < NEED_SESSIONS

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 0' }}>
        <button className="back-btn" onClick={() => nav('/history')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6 L9 12 L15 18" /></svg>
        </button>
        <h2 style={{ padding: 0 }}>내 행동 리포트</h2>
      </div>

      {legacy > 0 && (
        <div className="legacy-banner">판단 기록이 없는 세션 {legacy}개는 일부 분석에서 제외돼요</div>
      )}
      {fullLock ? (
        <div className="card center" style={{ padding: '32px 20px', gap: 10, marginTop: 8 }}>
          <span className="lock-circle"><Lock size={18} /></span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>분석할 세션이 아직 부족해요</div>
          <div className="dim" style={{ fontSize: 12 }}>판단 기록이 있는 {NEED_SESSIONS}세션 완료 후 열려요 ({judged}/{NEED_SESSIONS})</div>
          <div className="lock-track"><div style={{ width: `${Math.round((judged / NEED_SESSIONS) * 100)}%` }} /></div>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            {metrics.map((m) => (
              <div key={m.title} className="card metric-card" style={m.locked ? { opacity: 0.75 } : undefined}>
                <div className="dim" style={{ fontSize: 11, fontWeight: 600 }}>{m.title}</div>
                {m.locked ? (
                  <>
                    <div className="dim" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><Lock /></span>
                      <span style={{ fontSize: 11, lineHeight: 1.45 }}>{m.lockText}</span>
                    </div>
                    <div className="lock-track" style={{ marginTop: 6 }}><div style={{ width: `${m.lockPct}%` }} /></div>
                  </>
                ) : (
                  <>
                    <div className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: TONE[m.tone ?? 'text'] }}>{m.value}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.45 }}>{m.desc}</div>
                    <div className="dim" style={{ fontSize: 10, marginTop: 2, lineHeight: 1.4 }}>{m.basis}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="dim" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>준비 중인 분석</div>
      {TEASERS.map((tz) => (
        <div key={tz} className="teaser-row">
          <div className="dim" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Lock />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{tz}</span>
          </div>
          <span className="teaser-badge">준비 중</span>
        </div>
      ))}
    </div>
  )
}
