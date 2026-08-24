import { useState } from 'react'
import { polyline } from './AssetChart'
import CoachCard from './CoachCard'
import { macroCoach } from '../lib/coach'
import type { Headline } from '../lib/data'
import type { EconIndicator } from '../types'

// 클로드 디자인 "Simulation News.dc.html" 이식 — 시장 심리 대시보드
// 화살표 색은 상승/하락 가치판단 없는 warm/cool (손익 green/red와 구분)
const WARM = '#f5a623'
const COOL = '#1fb6ff'
const C_CPI = '#3d5cff'
const C_PCE = '#1fb6ff'
const C_PPI = '#9b2ff8'
const W = 326 // 차트 viewBox 폭 (디자인 기준)

const last = (a: number[]) => a[a.length - 1]
const prv = (a: number[]) => a[a.length - 2]

// 주요 지수 타일 — 자산 가격이라 손익 green/red 사용 (엔/달러는 달러 강세=리스크오프라 반전)
const MARKETS = [
  { id: 'NDX', name: '나스닥 100', fmt: (v: number) => Math.round(v).toLocaleString(), invert: false },
  { id: 'GOLD', name: '금 (온스)', fmt: (v: number) => Math.round(v).toLocaleString(), invert: false },
  { id: 'JPY', name: '엔/달러', fmt: (v: number) => v.toFixed(1), invert: true },
  { id: 'WTI', name: 'WTI 유가', fmt: (v: number) => v.toFixed(1), invert: false },
]

export function arrowOf(cur: number, prev: number, eps: number) {
  return cur - prev > eps ? { a: '▲', c: WARM } : prev - cur > eps ? { a: '▼', c: COOL } : { a: '→', c: 'var(--dim)' }
}

export function zoneOf(v: number) {
  if (v < 15) return { z: '안정', c: '#4caf50', bg: 'rgba(76,175,80,0.14)' }
  if (v < 20) return { z: '주의', c: '#f5a623', bg: 'rgba(245,166,35,0.14)' }
  if (v < 30) return { z: '불안', c: '#ff7a45', bg: 'rgba(255,122,69,0.14)' }
  return { z: '공포', c: 'var(--red)', bg: 'rgba(244,67,54,0.14)' }
}

// 요약 핀 타일 줄 — 홈 '시장 현황'과 공유
export function Pins({ items }: { items: { label: string; value: string; tag: string; tagColor: string }[] }) {
  return (
    <div className="num" style={{ display: 'flex', gap: 6 }}>
      {items.map((s) => (
        <div key={s.label} className="card" style={{ flex: 1, borderRadius: 10, padding: '7px 4px', alignItems: 'center', gap: 2 }}>
          <span className="dim" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{s.label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            {s.value}<span style={{ fontSize: 9, fontWeight: 600, color: s.tagColor }}>{s.tag}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

interface CardProps {
  group: string
  title: React.ReactNode
  right: React.ReactNode
  isNew?: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Card({ group, title, right, isNew, open, onToggle, children }: CardProps) {
  return (
    <div className="card" style={{ borderRadius: 14, padding: '13px 14px', cursor: 'pointer', userSelect: 'none', gap: 0 }} onClick={onToggle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dim" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>{group}</span>
            {isNew && (
              <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #1fb6ff, #3d5cff)', borderRadius: 999, padding: '2px 6px' }}>NEW</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{title}</div>
        </div>
        <div style={{ textAlign: 'right' }}>{right}</div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 4, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </div>
      {children}
    </div>
  )
}

// 확장 시 세로축 최소/최대 라벨
const AxisLabels = ({ h, maxL, minL }: { h: number; maxL: string; minL: string }) => (
  <>
    <text x="3" y="11" fontSize="8" fill="var(--dim)">{maxL}</text>
    <text x="3" y={h - 4} fontSize="8" fill="var(--dim)">{minL}</text>
  </>
)

const XLabels = ({ labels }: { labels: string[] }) => (
  <div className="dim" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9 }}>
    {labels.map((l) => <span key={l}>{l}</span>)}
  </div>
)

export default function NewsPanel({ econ, nowTs, headlines }: { econ: EconIndicator[]; nowTs: number; headlines?: Headline[] }) {
  const [exp, setExp] = useState<string | null>(null)
  const heads = (headlines ?? []).filter((h) => h[0] < nowTs).slice(-8).reverse() // 시뮬 시점 이전 최근 8건

  // 시뮬 시점 이전 발표분만, 월간 36개(3년) / VIX 주간 78개(18개월)
  const vals = (id: string, n: number) => {
    const pts = econ.find((e) => e.id === id)?.data.filter((p) => p[0] < nowTs) ?? []
    return pts.slice(-n).map((p) => p[1])
  }
  const isNew = (id: string) => {
    const pts = econ.find((e) => e.id === id)?.data.filter((p) => p[0] < nowTs) ?? []
    return pts.length > 0 && nowTs - pts[pts.length - 1][0] < 7 * 86400
  }
  const H = (k: string) => (exp === k ? 110 : 56)
  const toggle = (k: string) => () => setExp(exp === k ? null : k)

  const vix = vals('VIX', 78)
  const rate = vals('FFR', 36)
  const cpi = vals('CPI', 36)
  const pce = vals('PCE', 36)
  const ppi = vals('PPI', 36)
  const un = vals('UNEMP', 36)
  const nf = vals('NFP', 36)
  const m2 = vals('M2', 36)
  if (vix.length < 2 || rate.length < 2 || cpi.length < 2) return <div className="empty">이 구간엔 지표 데이터가 없어요</div>

  // ── 요약 타일 ──
  const rdiff = Math.round((last(rate) - prv(rate)) * 100) / 100
  const rateArrow = rdiff === 0 ? { a: '→', c: 'var(--dim)' } : rdiff > 0 ? { a: '▲', c: WARM } : { a: '▼', c: COOL }
  const cpiA = arrowOf(last(cpi), prv(cpi), 0.05)
  const uA = arrowOf(last(un), prv(un), 0.05)
  const vz = zoneOf(last(vix))
  const summary = [
    { label: '기준금리', value: last(rate).toFixed(2) + '%', tag: rateArrow.a, tagColor: rateArrow.c },
    { label: 'CPI', value: last(cpi).toFixed(1) + '%', tag: cpiA.a, tagColor: cpiA.c },
    { label: '실업률', value: last(un).toFixed(1) + '%', tag: uA.a, tagColor: uA.c },
    { label: 'VIX', value: last(vix).toFixed(1), tag: vz.z, tagColor: vz.c },
  ]

  // ── VIX ──
  const vH = H('vix')
  const vmn = Math.min(...vix) - 1.5
  const vmx = Math.max(...vix) + 1.5
  const vL = polyline(vix, W, vH, vmn, vmx)
  const va = arrowOf(last(vix), prv(vix), 0.05)
  const vixPos = Math.max(2, Math.min(98, ((last(vix) - 10) / 30) * 100))

  // ── 금리 (스텝 라인) ──
  const rH = H('rate')
  const rmx = Math.max(...rate) + 0.6
  const rp = 5
  const rx = (i: number) => rp + (i / (rate.length - 1)) * (W - 2 * rp)
  const ry = (v: number) => rp + (1 - v / rmx) * (rH - 2 * rp)
  const rd = rate
    .map((v, i) => (i ? `L${rx(i).toFixed(1)} ${ry(rate[i - 1]).toFixed(1)} L${rx(i).toFixed(1)} ${ry(v).toFixed(1)}` : `M${rx(0).toFixed(1)} ${ry(v).toFixed(1)}`))
    .join(' ')

  // ── 물가 3종 (같은 스케일) ──
  const iH = H('infl')
  const all3 = [...cpi, ...pce, ...ppi]
  const imn = Math.min(...all3) - 0.4
  const imx = Math.max(...all3) + 0.4
  const dCpi = polyline(cpi, W, iH, imn, imx)
  const dPce = polyline(pce, W, iH, imn, imx)
  const dPpi = polyline(ppi, W, iH, imn, imx)
  const inflRows = [
    { name: 'CPI', color: C_CPI, arr: cpi },
    { name: 'PCE', color: C_PCE, arr: pce },
    { name: 'PPI', color: C_PPI, arr: ppi },
  ].map(({ name, color, arr }) => {
    const a = arrowOf(last(arr), prv(arr), 0.05)
    return { name, color, val: last(arr).toFixed(1) + '%', prev: prv(arr).toFixed(1) + '%', arrow: a }
  })

  // ── 고용 (실업률 라인 + NFP 바) ──
  const eH = H('emp')
  const HALF = 150
  const uL = polyline(un, HALF, eH, Math.min(...un) - 0.15, Math.max(...un) + 0.15)
  const maxN = Math.max(...nf.map(Math.abs), 1)
  const slot = 144 / (nf.length - 1)
  const bars = nf
    .map((v, i) => {
      const bw = Math.max(1.6, slot * 0.55)
      const bx = 3 + i * slot - bw / 2
      const bh = (Math.abs(v) / maxN) * (eH - 12)
      return `M${bx.toFixed(1)} ${(eH - 3).toFixed(1)} v-${bh.toFixed(1)} h${bw.toFixed(1)} v${bh.toFixed(1)} Z`
    })
    .join(' ')
  const nA = arrowOf(last(nf), prv(nf), 1)

  // ── M2 (제로라인) ──
  const mH = H('m2')
  const mmn = Math.min(...m2, 0) - 0.5
  const mmx = Math.max(...m2) + 0.5
  const mL = polyline(m2, W, mH, mmn, mmx)
  const zy = 5 + (1 - (0 - mmn) / (mmx - mmn)) * (mH - 10)
  const mA = arrowOf(last(m2), prv(m2), 0.05)
  const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

  // ── 주요 지수 (주간 53개 ≈ 1년) ──
  const markets = MARKETS.flatMap(({ id, name, fmt, invert }) => {
    const arr = vals(id, 53)
    if (arr.length < 2) return []
    const chg = ((last(arr) - prv(arr)) / prv(arr)) * 100
    const color = chg >= 0 !== invert ? 'var(--green)' : 'var(--red)'
    const L = polyline(arr, 132, 30, Math.min(...arr), Math.max(...arr))
    return [{ name, val: fmt(last(arr)), chg: (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%', color, ...L }]
  })

  const bigVal: React.CSSProperties = { fontSize: 17, fontWeight: 700 }

  return (
    <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Pins items={summary} />
      <CoachCard lines={macroCoach(econ, nowTs)} basis="금리 · CPI · VIX 기반" isNew={isNew('FFR') || isNew('CPI')} />

      {headlines && (
        <div className="card" style={{ borderRadius: 14, padding: '13px 14px', gap: 0 }}>
          <span className="dim" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>뉴스</span>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>주요 헤드라인</div>
          {heads.length === 0 ? (
            <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>이 시기 뉴스는 제공되지 않아요</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }}>
              {heads.map(([ts, title, source]) => (
                <div key={ts + title} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <span className="dim" style={{ fontSize: 9, fontWeight: 600, flexShrink: 0, minWidth: 38 }}>{source}</span>
                  <span style={{ fontSize: 11.5, lineHeight: 1.35 }}>{title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {markets.length > 0 && (
        <div className="card" style={{ borderRadius: 14, padding: '13px 14px 11px', gap: 0 }}>
          <span className="dim" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>시장</span>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>주요 지수 · 자산</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            {markets.map((m) => (
              <div key={m.name} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
                  <span className="dim" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{m.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: m.color, whiteSpace: 'nowrap' }}>{m.chg}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 1 }}>{m.val}</div>
                <svg width="100%" viewBox="0 0 132 30" style={{ display: 'block', marginTop: 4 }}>
                  <path d={m.d} fill="none" stroke={m.color} strokeWidth="1.4" />
                  <circle cx={m.lx.toFixed(1)} cy={m.ly.toFixed(1)} r="2" fill={m.color} />
                </svg>
              </div>
            ))}
          </div>
          <XLabels labels={['-1년', '-6개월', '최근']} />
        </div>
      )}

      <Card
        group="심리" title="VIX 변동성지수" isNew={isNew('VIX')} open={exp === 'vix'} onToggle={toggle('vix')}
        right={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: vz.c, background: vz.bg, borderRadius: 999, padding: '3px 8px' }}>{vz.z}</span>
              <span style={bigVal}>{last(vix).toFixed(1)}</span>
            </div>
            <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>이전 {prv(vix).toFixed(1)} <span style={{ color: va.c }}>{va.a}</span></div>
          </>
        }
      >
        <div style={{ marginTop: 12, position: 'relative', height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #4caf50 0%, #f5a623 25%, #ff7a45 50%, #f44336 85%)', opacity: 0.9 }}>
          <div style={{ position: 'absolute', top: '50%', left: `${vixPos.toFixed(1)}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', border: `3px solid ${vz.c}`, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', boxSizing: 'border-box' }} />
        </div>
        <div className="dim" style={{ position: 'relative', height: 12, marginTop: 3, fontSize: 9 }}>
          <span style={{ position: 'absolute', left: 0 }}>안정</span>
          <span style={{ position: 'absolute', left: '17%' }}>주의</span>
          <span style={{ position: 'absolute', left: '33%' }}>불안</span>
          <span style={{ position: 'absolute', left: '67%' }}>공포</span>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${vH}`} style={{ display: 'block', marginTop: 7 }}>
          <path d={vL.d} fill="none" stroke={vz.c} strokeWidth="1.5" />
          <circle cx={vL.lx.toFixed(1)} cy={vL.ly.toFixed(1)} r="2.5" fill={vz.c} />
          {exp === 'vix' && <AxisLabels h={vH} maxL={vmx.toFixed(0)} minL={vmn.toFixed(0)} />}
        </svg>
        <XLabels labels={['-18개월', '-1년', '-6개월', '최근']} />
      </Card>

      <Card
        group="금리" title="기준금리 (실효)" open={exp === 'rate'} onToggle={toggle('rate')}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: rdiff === 0 ? 'var(--dim)' : rdiff > 0 ? WARM : COOL, background: 'var(--card2)', borderRadius: 999, padding: '3px 8px' }}>
              {rdiff === 0 ? '동결' : (rdiff > 0 ? '+' : '') + rdiff.toFixed(2) + '%p'}
            </span>
            <span style={bigVal}>{last(rate).toFixed(2)}%</span>
          </div>
        }
      >
        <svg width="100%" viewBox={`0 0 ${W} ${rH}`} style={{ display: 'block', marginTop: 10 }}>
          <path d={rd} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
          <circle cx={rx(rate.length - 1).toFixed(1)} cy={ry(last(rate)).toFixed(1)} r="2.5" fill="var(--accent)" />
          {exp === 'rate' && <AxisLabels h={rH} maxL={rmx.toFixed(1) + '%'} minL="0%" />}
        </svg>
        <XLabels labels={['-3년', '-2년', '-1년', '최근']} />
      </Card>

      <Card
        group="물가" title={<>CPI · PCE · PPI <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>전년비</span></>}
        isNew={isNew('CPI') || isNew('PCE') || isNew('PPI')} open={exp === 'infl'} onToggle={toggle('infl')}
        right={
          <>
            <div style={bigVal}><span className="dim" style={{ fontSize: 10, fontWeight: 600 }}>CPI </span>{last(cpi).toFixed(1)}% <span style={{ fontSize: 11, color: cpiA.c }}>{cpiA.a}</span></div>
            <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>이전 {prv(cpi).toFixed(1)}%</div>
          </>
        }
      >
        <svg width="100%" viewBox={`0 0 ${W} ${iH}`} style={{ display: 'block', marginTop: 10 }}>
          <path d={dPpi.d} fill="none" stroke={C_PPI} strokeWidth="1.3" opacity="0.85" />
          <path d={dPce.d} fill="none" stroke={C_PCE} strokeWidth="1.3" opacity="0.85" />
          <path d={dCpi.d} fill="none" stroke={C_CPI} strokeWidth="1.6" />
          {exp === 'infl' && <AxisLabels h={iH} maxL={imx.toFixed(1) + '%'} minL={imn.toFixed(1) + '%'} />}
        </svg>
        <XLabels labels={['-3년', '-2년', '-1년', '최근']} />
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {inflRows.map((r) => (
            <div key={r.name} style={{ flex: 1, border: '1px solid var(--hairline)', borderRadius: 10, padding: '6px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: r.color }} />
                <span className="dim" style={{ fontSize: 10 }}>{r.name}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{r.val} <span style={{ fontSize: 10, color: r.arrow.c }}>{r.arrow.a}</span></div>
              <div className="dim" style={{ fontSize: 9 }}>이전 {r.prev}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        group="고용" title="노동시장 온도" isNew={isNew('UNEMP') || isNew('NFP')} open={exp === 'emp'} onToggle={toggle('emp')}
        right={
          <>
            <div style={bigVal}><span className="dim" style={{ fontSize: 10, fontWeight: 600 }}>실업률 </span>{last(un).toFixed(1)}% <span style={{ fontSize: 11, color: uA.c }}>{uA.a}</span></div>
            <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>이전 {prv(un).toFixed(1)}%</div>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dim" style={{ fontSize: 10 }}>실업률</div>
            <svg width="100%" viewBox={`0 0 ${HALF} ${eH}`} style={{ display: 'block', marginTop: 4 }}>
              <path d={uL.d} fill="none" stroke="var(--accent)" strokeWidth="1.4" />
              <circle cx={uL.lx.toFixed(1)} cy={uL.ly.toFixed(1)} r="2.2" fill="var(--accent)" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="dim" style={{ fontSize: 10 }}>비농업 고용 <span style={{ fontSize: 9 }}>천 명</span></span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{last(nf) >= 0 ? '+' : ''}{Math.round(last(nf))} <span style={{ fontSize: 9, color: nA.c }}>{nA.a}</span></span>
            </div>
            <svg width="100%" viewBox={`0 0 ${HALF} ${eH}`} style={{ display: 'block', marginTop: 4 }}>
              <path d={bars} fill={C_PCE} opacity="0.75" />
            </svg>
          </div>
        </div>
        <XLabels labels={['-3년', '최근']} />
      </Card>

      <Card
        group="유동성" title={<>M2 증가율 <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>전년비</span></>}
        open={exp === 'm2'} onToggle={toggle('m2')}
        right={
          <>
            <div style={bigVal}>{signed(last(m2))} <span style={{ fontSize: 11, color: mA.c }}>{mA.a}</span></div>
            <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>이전 {signed(prv(m2))}</div>
          </>
        }
      >
        <svg width="100%" viewBox={`0 0 ${W} ${mH}`} style={{ display: 'block', marginTop: 10 }}>
          <line x1="5" y1={zy.toFixed(1)} x2={W - 5} y2={zy.toFixed(1)} stroke="var(--hairline)" strokeWidth="1" strokeDasharray="3 3" />
          <path d={mL.d} fill="none" stroke={C_PPI} strokeWidth="1.5" />
          <circle cx={mL.lx.toFixed(1)} cy={mL.ly.toFixed(1)} r="2.5" fill={C_PPI} />
          {exp === 'm2' && <AxisLabels h={mH} maxL={mmx.toFixed(1) + '%'} minL={mmn.toFixed(1) + '%'} />}
        </svg>
        <XLabels labels={['-3년', '-2년', '-1년', '최근']} />
      </Card>

      <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '2px 0 4px', fontSize: 10 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11 V8 a4 4 0 0 1 8 0 v3" />
        </svg>
        시점 추정을 막기 위해 날짜는 표시하지 않아요
      </div>
    </div>
  )
}
