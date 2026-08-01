import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetChart from '../components/AssetChart'
import { currentEquity, simProgress, useStore } from '../store'
import type { SimRecord } from '../types'

const START_BALANCE = 1_000_000

const PERIODS = [
  { key: '1w', label: '1주' },
  { key: '1m', label: '1달' },
  { key: 'all', label: '전체' },
] as const

const won = (n: number) => '₩' + n.toLocaleString('ko-KR')
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '')

const EYE_OPEN = 'M3 12 C3 12 6 6 12 6 C18 6 21 12 21 12 C21 12 18 18 12 18 C6 18 3 12 3 12 Z M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9'
const EYE_OFF = 'M3 3 L21 21 M10.5 10.6 A3 3 0 0 0 13.4 13.5 M7 7 C4.5 8.5 3 12 3 12 C3 12 6 18 12 18 C13.8 18 15.4 17.4 16.7 16.6 M12 6 C18 6 21 12 21 12 C21 12 20.4 13.2 19.3 14.5'

// 오늘부터 거꾸로 연속 연습일 수
function streak(records: SimRecord[]): number {
  const days = new Set(records.map((r) => new Date(r.endedAt).toDateString()))
  let n = 0
  for (const d = new Date(); days.has(d.toDateString()); d.setDate(d.getDate() - 1)) n++
  return n
}

// 기간 내 연습 종료 시점의 잔고 시계열 + 현재 자산
function assetSeries(records: SimRecord[], period: (typeof PERIODS)[number]['key'], current: number): number[] {
  const asc = [...records].sort((a, b) => a.endedAt - b.endedAt)
  const cutoff = period === 'all' ? 0 : Date.now() - (period === '1w' ? 7 : 30) * 86_400_000
  const base = asc.filter((r) => r.endedAt < cutoff).at(-1)?.endBalance ?? START_BALANCE
  return [base, ...asc.filter((r) => r.endedAt >= cutoff).map((r) => r.endBalance), current]
}

export default function Home() {
  const nav = useNavigate()
  const { balance, records, activeSim, candles, resume, endNow } = useStore()
  const [hideAsset, setHideAsset] = useState(false)
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('1m')
  const dialogRef = useRef<HTMLDialogElement>(null)

  // 진행중 시뮬이 있으면 캔들을 다시 로드해 현재 평가액 계산
  useEffect(() => {
    resume()
  }, [resume])

  const totalAsset = Math.round(activeSim && candles.length ? currentEquity(activeSim, candles) : balance)
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
  const periodLabel = PERIODS.find((p) => p.key === period)!.label

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
          {hideAsset ? '₩ ******' : won(totalAsset)}
        </div>
        {!hideAsset && (
          <div className={`num ${up ? 'up' : down ? 'down' : 'sub'}`} style={{ fontSize: 14, fontWeight: 500 }}>
            {newUser
              ? `시작 자산 ${won(START_BALANCE)}`
              : `${sign(delta)}${won(Math.abs(delta))} (${sign(deltaRate)}${Math.abs(deltaRate).toFixed(1)}%)`}
          </div>
        )}
      </section>

      {activeSim ? (
        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px' }}>현재 연습 진행 중</div>
            <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{progress}%</div>
          </div>
          <div className="track">
            <div style={{ width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <button className="pill pill-primary" style={{ flex: 1 }} onClick={() => nav('/sim')}>연습 계속하기</button>
            <button className="pill pill-secondary" onClick={() => dialogRef.current?.showModal()}>그만두기</button>
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
            {PERIODS.map((p) => (
              <button key={p.key} className={`chip ${p.key === period ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <AssetChart values={assetSeries(records, period, totalAsset)} startLabel={`${periodLabel} 전`} />
      </section>

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
        <h3>연습을 종료할까요?</h3>
        <p>남은 포지션은 종가로 청산되고<br />회고를 작성합니다.</p>
        <div className="actions">
          <button className="pill pill-secondary" onClick={() => dialogRef.current?.close()}>취소</button>
          <button className="pill pill-danger" onClick={() => { dialogRef.current?.close(); endNow(); nav('/sim') }}>종료하기</button>
        </div>
      </dialog>
    </div>
  )
}
