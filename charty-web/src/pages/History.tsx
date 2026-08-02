import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetChart from '../components/AssetChart'
import { STYLES, fmtW } from '../lib/data'
import { useStore } from '../store'
import type { SimRecord, Style } from '../types'

const START_BALANCE = 1_000_000

const styleLabel = (r: SimRecord) => STYLES[r.style as Style]?.label ?? r.styleLabel ?? '커스텀'

export default function History() {
  const nav = useNavigate()
  const { records, balance } = useStore()
  const [filter, setFilter] = useState('전체')
  const [openId, setOpenId] = useState<string | null>(null)

  if (records.length === 0) {
    return (
      <div className="page" style={{ minHeight: 'calc(100dvh - 96px)' }}>
        <h2 style={{ padding: '12px 4px 0' }}>기록</h2>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 40 }}>
          <div className="empty-tile">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4 H18 V20 H6 Z M9 9 H15 M9 13 H15" />
            </svg>
          </div>
          <div className="center">
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>아직 완료한 연습이 없어요.</div>
            <div className="dim" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>연습 탭에서 첫 시뮬레이션을<br />시작해보세요!</div>
          </div>
          <button className="pill pill-primary" onClick={() => nav('/practice')}>연습하러 가기</button>
        </div>
      </div>
    )
  }

  // 잔고 시계열 (과거 → 현재) + 통계
  const asc = [...records].sort((a, b) => a.endedAt - b.endedAt)
  const series = [START_BALANCE, ...asc.map((r) => r.endBalance)]
  const winRate = Math.round((records.filter((r) => r.pnlPct > 0).length / records.length) * 100)
  const avgPct = records.reduce((s, r) => s + r.pnlPct, 0) / records.length

  const labels = ['전체', ...new Set(records.map(styleLabel))]
  const shown = records.filter((r) => filter === '전체' || styleLabel(r) === filter)

  // 날짜별 그룹 (records는 최신순)
  const groups: { date: string; items: SimRecord[] }[] = []
  for (const r of shown) {
    const date = new Date(r.endedAt).toLocaleDateString()
    const g = groups.at(-1)
    if (g && g.date === date) g.items.push(r)
    else groups.push({ date, items: [r] })
  }

  return (
    <div className="page">
      <h2 style={{ padding: '12px 4px 0' }}>기록</h2>

      <div className="card" style={{ gap: 4, paddingBottom: 14 }}>
        <div className="dim" style={{ fontSize: 13 }}>현재 총 자산</div>
        <div className="num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.374px' }}>{fmtW(balance)}</div>
        <AssetChart values={series} startLabel={new Date(asc[0].endedAt).toLocaleDateString()} />
        <div className="dim num" style={{ fontSize: 12, marginTop: 4 }}>
          총 {records.length}회 연습 · 승률 {winRate}% · 평균 {avgPct >= 0 ? '+' : ''}{avgPct.toFixed(1)}%
        </div>
      </div>

      <div className="filter-chips">
        {labels.map((l) => (
          <button key={l} className={filter === l ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilter(l)}>
            {l}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="group-label">{g.date}</div>
          {g.items.map((r) => {
            const open = openId === r.id
            const up = r.pnlPct >= 0
            return (
              <button key={r.id} className={`card rec${open ? ' open' : ''}`} onClick={() => setOpenId(open ? null : r.id)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{r.symbol}</div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>{styleLabel(r)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div className={`num ${up ? 'green' : 'red'}`} style={{ fontSize: 16, fontWeight: 600 }}>
                      {up ? '+' : ''}{r.pnlPct.toFixed(1)}%
                    </div>
                    <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9 L12 15 L18 9" />
                    </svg>
                  </div>
                </div>
                {open && (
                  <>
                    <div className="dim num" style={{ fontSize: 13, marginTop: 12 }}>
                      {fmtW(r.startBalance)} → {fmtW(r.endBalance)} · 거래 {r.tradeCount}회 · 감정 {r.emotion}
                    </div>
                    {r.memo && <div className="memo">&ldquo;{r.memo}&rdquo;</div>}
                  </>
                )}
              </button>
            )
          })}
        </div>
      ))}
      {shown.length === 0 && <div className="empty">해당 스타일의 기록이 없어요.</div>}
    </div>
  )
}
