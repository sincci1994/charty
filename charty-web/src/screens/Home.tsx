import { useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../lib/nav'
import AssetChart from '../components/AssetChart'
import { Pins, arrowOf, zoneOf } from '../components/NewsPanel'
import { START_BALANCE, fmtW, loadEcon, loadNews } from '../lib/data'
import { equity } from '../lib/engine'
import { simProgress, useStore } from '../store'
import type { EconIndicator, NewsData, SimRecord } from '../types'

const PERIODS = { '1w': '1주', '1m': '1달', all: '전체' } as const
type PeriodKey = keyof typeof PERIODS

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '')
const pin = (label: string, value: string, a: { a: string; c: string }) => ({ label, value, tag: a.a, tagColor: a.c })

const EYE_OPEN = 'M3 12 C3 12 6 6 12 6 C18 6 21 12 21 12 C21 12 18 18 12 18 C6 18 3 12 3 12 Z M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9'
const EYE_OFF = 'M3 3 L21 21 M10.5 10.6 A3 3 0 0 0 13.4 13.5 M7 7 C4.5 8.5 3 12 3 12 C3 12 6 18 12 18 C13.8 18 15.4 17.4 16.7 16.6 M12 6 C18 6 21 12 21 12 C21 12 20.4 13.2 19.3 14.5'

// 공포·탐욕지수 구간 (CNN 기준)
function fngZoneOf(v: number) {
  if (v < 25) return { z: '극단적 공포', c: 'var(--red)', bg: 'rgba(244,67,54,0.14)' }
  if (v < 45) return { z: '공포', c: '#ff7a45', bg: 'rgba(255,122,69,0.14)' }
  if (v < 56) return { z: '중립', c: '#f5a623', bg: 'rgba(245,166,35,0.14)' }
  if (v < 76) return { z: '탐욕', c: '#7cb342', bg: 'rgba(124,179,66,0.14)' }
  return { z: '극단적 탐욕', c: '#4caf50', bg: 'rgba(76,175,80,0.14)' }
}

function fmtAgo(ts: number): string {
  const m = Math.max(1, Math.round(Date.now() / 1000 / 60 - ts / 60))
  if (m < 60) return `${m}분 전`
  if (m < 1440) return `${Math.round(m / 60)}시간 전`
  return `${Math.round(m / 1440)}일 전`
}

// 오늘부터 거꾸로 연속 연습일 수
function streak(records: SimRecord[]): number {
  const days = new Set(records.map((r) => new Date(r.endedAt).toDateString()))
  let n = 0
  for (const d = new Date(); days.has(d.toDateString()); d.setDate(d.getDate() - 1)) n++
  return n
}

// 기간 내 연습 종료 시점의 잔고 시계열 + 현재 자산
function assetSeries(records: SimRecord[], period: PeriodKey, current: number): number[] {
  const asc = [...records].sort((a, b) => a.endedAt - b.endedAt)
  const cutoff = period === 'all' ? 0 : Date.now() - (period === '1w' ? 7 : 30) * 86_400_000
  const base = asc.filter((r) => r.endedAt < cutoff).at(-1)?.endBalance ?? START_BALANCE
  return [base, ...asc.filter((r) => r.endedAt >= cutoff).map((r) => r.endBalance), current]
}

export default function Home() {
  const nav = useNav()
  const { balance, records, activeSim, candles, resume, discardSim } = useStore()
  const [hideAsset, setHideAsset] = useState(false)
  const [period, setPeriod] = useState<PeriodKey>('1m')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [econ, setEcon] = useState<EconIndicator[] | null>(null)
  const [news, setNews] = useState<NewsData | null>(null)
  const [region, setRegion] = useState<'kr' | 'us'>('kr')
  const [newsMore, setNewsMore] = useState(false)

  useEffect(() => {
    loadEcon().then(setEcon).catch(() => setEcon([]))
    loadNews().then(setNews).catch(() => setNews(null))
  }, [])

  // 시장 현황 — econ.json 최신 2개 값으로 구성. 해외=미국 지표 게이지·핀, 국내=코스피·코스닥·환율 시세
  const market = useMemo(() => {
    if (!econ) return null
    const pair = (id: string) => {
      const d = econ.find((e) => e.id === id)?.data ?? []
      return d.length >= 2 ? { cur: d[d.length - 1][1], prev: d[d.length - 2][1] } : null
    }
    if (region === 'kr') {
      const kospi = pair('KOSPI')
      const kosdaq = pair('KOSDAQ')
      const krw = pair('KRW')
      if (!kospi || !kosdaq || !krw) return null
      const num = (v: number) => Math.round(v).toLocaleString()
      return {
        moodDesc:
          `코스피는 지난주보다 ${kospi.cur > kospi.prev ? '오르는' : '내리는'} 중(${num(kospi.prev)}→${num(kospi.cur)}), ` +
          `코스닥은 ${kosdaq.cur > kosdaq.prev ? '상승' : '하락'} 흐름이에요. 원/달러는 ₩${num(krw.cur)} 수준이에요.`,
        gauges: [] as never[],
        pins: [
          pin('코스피', num(kospi.cur), arrowOf(kospi.cur, kospi.prev, 0.5)),
          pin('코스닥', num(kosdaq.cur), arrowOf(kosdaq.cur, kosdaq.prev, 0.5)),
          pin('원/달러', '₩' + num(krw.cur), arrowOf(krw.cur, krw.prev, 0.5)),
        ],
      }
    }
    const vix = pair('VIX')
    const fng = pair('FNG')
    const cpi = pair('CPI')
    const un = pair('UNEMP')
    const ffr = pair('FFR')
    if (!vix || !fng || !cpi || !un || !ffr) return null
    const vz = zoneOf(vix.cur)
    const fz = fngZoneOf(fng.cur)
    return {
      moodDesc:
        `변동성은 ${vix.cur > vix.prev ? '커지고' : '줄어들고'}(VIX ${vix.prev.toFixed(1)}→${vix.cur.toFixed(1)}), ` +
        `심리는 ${fz.z} 구간이에요. 물가는 ${cpi.cur < cpi.prev ? '내려오는 중' : '오르는 중'}, ` +
        `고용은 ${un.cur > un.prev ? '식는 중' : '탄탄한 편'}이에요.`,
      gauges: [
        {
          name: 'VIX 변동성지수', val: vix.cur.toFixed(1), zone: vz,
          track: 'linear-gradient(90deg, #4caf50 0%, #f5a623 25%, #ff7a45 50%, #f44336 85%)',
          pos: Math.max(4, Math.min(96, ((vix.cur - 10) / 30) * 100)), left: '안정', right: '공포',
        },
        {
          name: '공포·탐욕지수', val: String(Math.round(fng.cur)), zone: fz,
          track: 'linear-gradient(90deg, #f44336 0%, #ff7a45 30%, #f5a623 50%, #7cb342 70%, #4caf50 100%)',
          pos: Math.max(4, Math.min(96, fng.cur)), left: '공포', right: '탐욕',
        },
      ],
      pins: [
        pin('기준금리', ffr.cur.toFixed(2) + '%', arrowOf(ffr.cur, ffr.prev, 0.001)),
        pin('CPI', cpi.cur.toFixed(1) + '%', arrowOf(cpi.cur, cpi.prev, 0.05)),
        pin('실업률', un.cur.toFixed(1) + '%', arrowOf(un.cur, un.prev, 0.05)),
        pin('VIX', vix.cur.toFixed(1), arrowOf(vix.cur, vix.prev, 0.05)),
      ],
    }
  }, [econ, region])

  // 진행중 시뮬이 있으면 캔들을 다시 로드해 현재 평가액 계산
  useEffect(() => {
    resume()
  }, [resume])

  const totalAsset = Math.round(activeSim && candles.length ? equity(activeSim, candles[activeSim.cursor].c) : balance)
  const delta = totalAsset - START_BALANCE
  const deltaRate = (delta / START_BALANCE) * 100
  const up = delta > 0
  const down = delta < 0
  const newUser = records.length === 0 && !activeSim

  const winRate = records.length ? Math.round((records.filter((r) => r.pnlPct > 0).length / records.length) * 100) : null
  const profitRate = records.length ? records.reduce((s, r) => s + r.pnlPct, 0) / records.length : null
  const tradeCount = records.reduce((s, r) => s + r.tradeCount, 0)
  const streakDays = streak(records)
  const profitTint = profitRate === null || profitRate === 0 ? '' : profitRate > 0 ? 'tint-up' : 'tint-down'
  const progress = activeSim ? simProgress(activeSim) : 0
  const periodLabel = PERIODS[period]

  return (
    <div className="page">
      <header style={{ padding: '4px 0 8px' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.374px' }}>안녕하세요! 👋</div>
        <div className="sub" style={{ fontSize: 15, marginTop: 6 }}>
          {streakDays > 0 ? `${streakDays}일 연속 연습 중! 대단해요!` : '오늘 첫 연습을 시작해보세요!'}
        </div>
      </header>

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="sub" style={{ fontSize: 13 }}>총 자산</span>
          <button
            onClick={() => setHideAsset((v) => !v)}
            aria-label={hideAsset ? '자산 보이기' : '자산 숨기기'}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: 'var(--dim)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={hideAsset ? EYE_OFF : EYE_OPEN} />
            </svg>
          </button>
        </div>
        <div className="num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.374px' }}>
          {hideAsset ? '₩ ******' : fmtW(totalAsset)}
        </div>
        {!hideAsset && (
          <div className={`num ${up ? 'up' : down ? 'down' : 'sub'}`} style={{ fontSize: 14, fontWeight: 500 }}>
            {newUser
              ? `시작 자산 ${fmtW(START_BALANCE)}`
              : `${sign(delta)}${fmtW(Math.abs(delta))} (${sign(deltaRate)}${Math.abs(deltaRate).toFixed(1)}%)`}
          </div>
        )}
      </section>

      {activeSim ? (
        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px' }}>현재 {activeSim.styleLabel ?? '연습'} 진행 중</div>
            <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{progress}%</div>
          </div>
          <div className="track">
            <div style={{ width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <button className="pill pill-primary" style={{ flex: 1 }} onClick={() => nav('/sim')}>연습 계속하기</button>
            <button className="pill pill-secondary" onClick={() => dialogRef.current?.showModal()}>새로 시작</button>
          </div>
        </section>
      ) : (
        <button className="pill pill-primary pill-full" onClick={() => nav('/practice')}>연습하러 가기</button>
      )}

      <h2 style={{ fontSize: 17, letterSpacing: '-0.374px', margin: '14px 0 -2px' }}>성과 요약</h2>
      <div className="stats">
        <div className={`stat ${profitTint}`}>
          <b>{profitRate === null ? '-' : `${sign(profitRate)}${Math.abs(profitRate).toFixed(1)}%`}</b>
          <span>평균 수익률</span>
        </div>
        <div className="stat">
          <b>{winRate === null ? '-' : `${winRate}%`}</b>
          <span>승률</span>
        </div>
        <div className="stat">
          <b>{tradeCount}건</b>
          <span>총 거래 수</span>
        </div>
      </div>

      <section className="card" style={{ padding: '18px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px' }}>자산 추이</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
              <button key={k} className={`chip ${k === period ? 'active' : ''}`} onClick={() => setPeriod(k)}>
                {PERIODS[k]}
              </button>
            ))}
          </div>
        </div>
        <AssetChart values={assetSeries(records, period, totalAsset)} startLabel={`${periodLabel} 전`} />
      </section>

      <h2 style={{ fontSize: 17, letterSpacing: '-0.374px', margin: '14px 0 -2px' }}>매매 스타일 조언</h2>
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #1FB6FF, #9B2FF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 L13.9 8.1 L19 10 L13.9 11.9 L12 17 L10.1 11.9 L5 10 L10.1 8.1 Z M18 16 L18.7 17.8 L20.5 18.5 L18.7 19.2 L18 21 L17.3 19.2 L15.5 18.5 L17.3 17.8 Z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px' }}>
              {records.length === 0 ? '아직 분석할 기록이 없어요' : '매매 스타일 분석을 준비 중이에요'}
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 1 }}>
              {records.length === 0 ? '첫 연습을 마치면 매매 스타일 조언이 나타나요' : '곧 매매 기록 기반 조언이 제공될 예정이에요'}
            </div>
          </div>
        </div>
      </section>

      {market && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 -2px' }}>
            <h2 style={{ fontSize: 17, letterSpacing: '-0.374px', margin: 0 }}>시장 현황</h2>
            <div className="seg">
              {(['kr', 'us'] as const).map((r) => (
                <button key={r} className={region === r ? 'active' : ''} onClick={() => setRegion(r)}>
                  {r === 'kr' ? '국내' : '해외'}
                </button>
              ))}
            </div>
          </div>
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px' }}>지금 시장은</div>
                <div className="dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{market.moodDesc}</div>
              </div>
            </div>
            {market.gauges.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              {market.gauges.map((g) => (
                <div key={g.name} style={{ border: '1px solid var(--hairline)', borderRadius: 12, padding: '10px 12px' }}>
                  <div className="dim" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{g.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 3 }}>
                    <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>{g.val}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: g.zone.c, background: g.zone.bg, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>{g.zone.z}</span>
                  </div>
                  <div style={{ marginTop: 9, position: 'relative', height: 7, borderRadius: 4, background: g.track, opacity: 0.9 }}>
                    <div style={{ position: 'absolute', top: '50%', left: `${g.pos.toFixed(1)}%`, transform: 'translate(-50%,-50%)', width: 13, height: 13, borderRadius: '50%', background: '#fff', border: `3px solid ${g.zone.c}`, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', boxSizing: 'border-box' }} />
                  </div>
                  <div className="dim" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9 }}>
                    <span>{g.left}</span><span>{g.right}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
            <div style={{ marginTop: 6 }}>
              <Pins items={market.pins} />
            </div>
          </section>
        </>
      )}

      {news && news[region].length > 0 && (
        <>
          <h2 style={{ fontSize: 17, letterSpacing: '-0.374px', margin: '14px 0 -2px' }}>주요 뉴스</h2>
          <section className="card" style={{ padding: '4px 16px', gap: 0 }}>
            {news[region].slice(0, newsMore ? undefined : 4).map((nw, i, arr) => (
              <a
                key={nw.link || i}
                href={nw.link}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--hairline)', color: 'inherit', textDecoration: 'none' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.15px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {nw.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <span className="dim" style={{ fontSize: 11, fontWeight: 600 }}>{nw.source}</span>
                    <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--dim)' }} />
                    <span className="dim num" style={{ fontSize: 11 }}>{fmtAgo(nw.ts)}</span>
                  </div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M7 17 L17 7 M9 7 H17 V15" />
                </svg>
              </a>
            ))}
            {news[region].length > 4 && (
              <button
                onClick={() => setNewsMore((v) => !v)}
                style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 0', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', borderTop: '1px solid var(--hairline)' }}
              >
                {newsMore ? '접기' : '뉴스 더보기'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: newsMore ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
                  <path d="M9 6 L15 12 L9 18" />
                </svg>
              </button>
            )}
          </section>
        </>
      )}

      <div className="quick-links">
        <button className="quick" onClick={() => nav('/history')}>
          <div className="icon" style={{ background: 'linear-gradient(135deg, #1FB6FF, #3D5CFF)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7 H21 V19 H3 Z M3 11 H21 M7 15 H10" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>연습 기록</b>
            <span>지난 결과 보기</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6 L15 12 L9 18" />
          </svg>
        </button>
        <button className="quick" onClick={() => nav('/practice/style')}>
          <div className="icon" style={{ background: 'linear-gradient(135deg, #3D5CFF, #9B2FF8)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 20 V12 M12 20 V4 M18 20 V9" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>새 연습</b>
            <span>스타일 고르기</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6 L15 12 L9 18" />
          </svg>
        </button>
      </div>

      <dialog ref={dialogRef}>
        <h3>새로 시작할까요?</h3>
        <p>진행 중인 시뮬레이션이 삭제되고<br />새 연습이 시작됩니다.</p>
        <div className="actions">
          <button className="pill pill-secondary" onClick={() => dialogRef.current?.close()}>취소</button>
          <button className="pill pill-danger" onClick={() => { dialogRef.current?.close(); discardSim(); nav('/practice/style') }}>새로 시작</button>
        </div>
      </dialog>
    </div>
  )
}
