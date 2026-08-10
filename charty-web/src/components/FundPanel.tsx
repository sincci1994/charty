import { Fragment } from 'react'
import { fmtUsd, fundView, type FundRow, type OpYoy } from '../lib/fund'
import type { FundQuarter } from '../types'

// R10 재무 탭 — 공시일(filed) 이전 분기만 노출(미래 차단), 분기 라벨은 상대 표기(블라인드 정책).
// 절대액 표시는 의도적 선택: 규모로 종목 추정이 가능하지만 실가격 노출과 동급으로 수용 (기획서 6장)

const pctCell = (v: number | null, sign = true) =>
  v == null ? <span className="dim">—</span> : (
    <span style={{ color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>{sign && v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>
  )

const opYoyCell = (v: OpYoy) =>
  v == null ? <span className="dim">—</span>
  : typeof v === 'number' ? pctCell(v)
  : <span style={{ color: v === '흑자전환' ? 'var(--green)' : 'var(--red)' }}>{v}</span>

const usdCell = (v: number | null) =>
  v == null ? <span className="dim">—</span> : <span style={v < 0 ? { color: 'var(--red)' } : undefined}>{fmtUsd(v)}</span>

const METRICS: { label: string; cell: (r: FundRow) => React.ReactNode }[] = [
  { label: '매출', cell: (r) => usdCell(r.rev) },
  { label: '매출 YoY', cell: (r) => pctCell(r.revYoy) },
  { label: '영업이익', cell: (r) => usdCell(r.opInc) },
  { label: '영업이익률', cell: (r) => pctCell(r.opMargin, false) },
  { label: '영업이익 YoY', cell: (r) => opYoyCell(r.opYoy) },
]

export default function FundPanel({ quarters, nowTs, price }: { quarters?: FundQuarter[]; nowTs: number; price: number }) {
  const view = quarters?.length ? fundView(quarters, nowTs, price) : null
  const empty = (msg: string) => (
    <div className="card empty" style={{ minHeight: 320, justifyContent: 'center' }}>{msg}</div>
  )
  if (!quarters?.length) return empty('이 종목은 재무 공시가 제공되지 않아요')
  if (!view) return empty('이 시점엔 아직 공시된 재무가 없어요')

  const cols = [...view.rows].reverse() // 표는 과거 → 최근 순으로 읽힌다

  return (
    <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="card" style={{ borderRadius: 14, padding: '13px 14px', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="dim" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>기업</span>
              {view.isNew && (
                <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #1fb6ff, #3d5cff)', borderRadius: 999, padding: '2px 6px' }}>NEW</span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>분기 실적 <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>공시 기준</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              <span className="dim" style={{ fontSize: 10, fontWeight: 600 }}>PER </span>
              {view.per != null ? `${view.per.toFixed(1)}배` : 'N/A'}
            </div>
            <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>{view.per != null ? 'TTM · 현재가 기준' : view.perNote}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `62px repeat(${cols.length}, 1fr)`, gap: '8px 4px', marginTop: 13, fontSize: 11, alignItems: 'baseline' }}>
          <span />
          {cols.map((r) => (
            <span key={r.rel} className="dim" style={{ fontSize: 9, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.rel}</span>
          ))}
          {METRICS.map((m) => (
            <Fragment key={m.label}>
              <span className="dim" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{m.label}</span>
              {cols.map((r) => (
                <span key={r.rel} style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{m.cell(r)}</span>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '2px 0 4px', fontSize: 10 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11 V8 a4 4 0 0 1 8 0 v3" />
        </svg>
        시점 추정을 막기 위해 실제 분기·연도는 표시하지 않아요
      </div>
    </div>
  )
}
