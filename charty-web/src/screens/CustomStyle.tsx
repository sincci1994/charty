import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useNav } from '../lib/nav'
import type { Timeframe, Unit } from '../types'
import { MIN_BARS, TF, barsFor, estTime, loadMaxBars } from '../lib/data'
import { useStore } from '../store'

const UNIT_MAX: Record<Unit, number> = { 분: 1440, 시간: 720, 일: 365, 주: 52, 개월: 24, 년: 5 }
const MAX_CANDLES = 2000 // UX 상한 — 데이터 상한(MAX_BARS)과 별개로 시뮬이 늘어지는 것 방지
const UNITS = Object.keys(UNIT_MAX) as Unit[]
// tf 없는 칩 = 캔들 데이터 없음 → 비활성 (1분은 yfinance 제한으로 불가)
const TF_CHIPS: { label: string; tf?: Timeframe }[] = [
  { label: '1분' },
  ...(Object.entries(TF) as [Timeframe, { label: string }][]).map(([tf, { label }]) => ({ label, tf })),
]

export default function CustomStyle() {
  const nav = useNav()
  // optional catch-all([[...id]]) 파라미터 — /custom은 undefined, /custom/:id는 ['id']
  const id = useParams<{ id?: string[] }>().id?.[0]
  const { customs, saveCustom, deleteCustom } = useStore()
  const editing = customs.find((c) => c.id === id)

  const [name, setName] = useState(editing?.name ?? '')
  const [periodStr, setPeriodStr] = useState(editing ? String(editing.periodValue) : '')
  const [unit, setUnit] = useState<Unit | null>(editing?.periodUnit ?? null)
  const [tf, setTf] = useState<Timeframe | null>(editing?.tf ?? null)

  // 데이터 상한(candle-counts) 로드 — 실패·로딩 중엔 MAX_CANDLES(UX 상한)만 적용, 최종 검증은 시뮬 시작 시 pickRange가 함
  const [maxBars, setMaxBars] = useState<Record<Timeframe, number> | null>(null)
  useEffect(() => {
    loadMaxBars().then(setMaxBars).catch(() => {})
  }, [])

  const period = parseInt(periodStr, 10)
  const max = unit ? UNIT_MAX[unit] : 0
  const over = !!unit && period > max
  const hasPeriod = !!unit && period >= 1 && !over
  const bars = hasPeriod && tf ? barsFor({ id: '', name, periodValue: period, periodUnit: unit, tf }) : 0
  const tooShort = bars > 0 && bars < MIN_BARS
  const tooLong = !!tf && bars > Math.min(MAX_CANDLES, maxBars?.[tf] ?? Infinity)
  const barsBad = tooShort || tooLong
  const canSet = name.trim() !== '' && hasPeriod && tf !== null && !barsBad

  const periodHint = over
    ? `최대 ${max}${unit}까지 가능합니다`
    : hasPeriod
      ? `${period}${unit} 안에 거래 종료를 목표로 합니다`
      : unit
        ? `기간을 입력하세요 (1~${max}${unit})`
        : '숫자를 입력하고 단위를 선택하세요'


  const set = () => {
    if (!canSet || !unit || !tf) return
    saveCustom({ id: id ?? crypto.randomUUID(), name: name.trim(), periodValue: period, periodUnit: unit, tf })
    nav('/practice/style')
  }

  const del = () => {
    if (!id || !window.confirm('이 커스텀 스타일을 삭제할까요?')) return
    deleteCustom(id)
    nav('/practice/style')
  }

  return (
    <div className="page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 0' }}>
        <button className="back-btn" onClick={() => nav('/practice/style')} aria-label="뒤로">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6 L9 12 L15 18" /></svg>
        </button>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 600, letterSpacing: '-0.374px' }}>커스텀 트레이딩 스타일</div>
        {editing && (
          <button onClick={del} style={{ background: 'transparent', color: 'var(--danger)', fontWeight: 600, padding: '6px 4px' }}>
            Delete
          </button>
        )}
      </header>

      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 14 }}>Custom Trading Name</div>
      <input
        type="text"
        value={name}
        placeholder="이름을 입력하세요"
        onChange={(e) => setName(e.target.value)}
        style={{ height: 48, borderRadius: 12, border: '1px solid var(--hairline)', background: 'var(--card)', fontSize: 15, padding: '0 16px' }}
      />

      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 10 }}>Trading Period</div>
      <div className="card" style={{ borderRadius: 16, padding: 16, gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max || undefined}
            value={periodStr}
            placeholder="0"
            onChange={(e) => setPeriodStr(e.target.value)}
            style={{
              flex: 1, minWidth: 0, height: 48, borderRadius: 12, textAlign: 'center', fontSize: 20, fontWeight: 600,
              background: 'var(--bg)', fontVariantNumeric: 'tabular-nums', padding: '0 12px',
              border: over ? '1.5px solid var(--red)' : '1.5px solid transparent',
            }}
          />
          <div style={{ flex: 2.2, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {UNITS.map((u) => (
              <button key={u} className={`opt${unit === u ? ' selected' : ''}`} onClick={() => setUnit(u)} style={{ height: 34, borderRadius: 9, fontSize: 13, padding: 0 }}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="center" style={{ fontSize: 12, marginTop: 10, minHeight: 15, color: over ? 'var(--red)' : 'var(--dim)' }}>
          {periodHint}
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 10 }}>Candle Timeframe</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {TF_CHIPS.map((chip) => (
          <button
            key={chip.label}
            className={`opt${tf && chip.tf === tf ? ' selected' : ''}`}
            disabled={!chip.tf}
            onClick={() => setTf(chip.tf!)}
            style={{ height: 42, borderRadius: 999, fontSize: 13, padding: 0 }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {bars > 0 && (
        <>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: '14px 16px', marginTop: 8,
              border: barsBad ? '1px solid var(--danger)' : '1px solid var(--hairline)',
              background: barsBad ? 'transparent' : 'var(--accent-soft)',
            }}
          >
            <div>
              <div className="dim" style={{ fontSize: 13 }}>예상 소요시간</div>
              <div className="dim" style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>캔들 {bars.toLocaleString()}개</div>
            </div>
            <span style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: barsBad ? 'var(--danger)' : 'var(--accent)' }}>
              {estTime(bars)}
            </span>
          </div>
          {barsBad && (
            <div className="center" style={{ fontSize: 12, color: 'var(--danger)' }}>
              {tooShort ? '캔들이 너무 적어요. 기간을 늘리거나 더 짧은 타임프레임을 선택하세요' : '캔들이 너무 많아요. 기간을 줄이거나 더 긴 타임프레임을 선택하세요'}
            </div>
          )}
        </>
      )}

      <button className="pill pill-full pill-primary cta" style={{ marginTop: 12 }} disabled={!canSet} onClick={set}>
        Set
      </button>
      {!canSet && !barsBad && (
        <div className="dim center" style={{ fontSize: 12 }}>이름, 기간, 타임프레임을 모두 입력해주세요</div>
      )}
    </div>
  )
}
