import { useStore } from '../store'

// R16 AI 해석 카드 — 뉴스·재무 탭 공용. 더보기 토글(coach)로 on/off.
// 디자인 원본: Simulation News.dc.html (그라디언트 보더 1.2px + 브랜드 틴트 배경 + 그라디언트 타이틀).
// 문장은 lib/coach.ts 코퍼스에서 옴 — 여기는 표시만.
const GRAD_TEXT: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  background: 'linear-gradient(135deg, #1fb6ff, #3d5cff 55%, #9b2ff8)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

export default function CoachCard({ lines, basis, isNew }: { lines: string[] | null; basis?: string; isNew?: boolean }) {
  const coach = useStore((s) => s.coach)
  if (!coach || !lines?.length) return null
  return (
    <div style={{ borderRadius: 15, padding: 1.2, background: 'var(--ai-border)' }}>
      <div style={{ borderRadius: 13.5, background: 'var(--ai-inner)', padding: '12px 14px 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent)">
            <path d="M12 3 L13.9 9.1 L20 11 L13.9 12.9 L12 19 L10.1 12.9 L4 11 L10.1 9.1 Z" />
            <path d="M19 2.5 L19.8 4.9 L22.2 5.7 L19.8 6.5 L19 8.9 L18.2 6.5 L15.8 5.7 L18.2 4.9 Z" opacity="0.65" />
          </svg>
          <span style={GRAD_TEXT}>AI 해석</span>
          {isNew && (
            <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #1fb6ff, #3d5cff)', borderRadius: 999, padding: '2px 6px' }}>업데이트</span>
          )}
          <span style={{ flex: 1 }} />
          {basis && <span className="dim" style={{ fontSize: 9 }}>{basis}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {lines.map((t, i) => (
            <div key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' }}>{t}</div>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 9.5, marginTop: 8, opacity: 0.85 }}>시뮬 시점 데이터로 자동 생성된 해석이에요 · 매매 판단은 직접 하세요</div>
      </div>
    </div>
  )
}
