import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { fmtW } from '../lib/data'

interface Props {
  kind: 'sl' | 'tp'
  avgPrice: number
  currentPrice: number
  current?: number // 기존 값 — 없으면 신규 설정
  onClose: () => void
}

// 보유 중 손절·목표 계획 수정 — 중립 톤: 어느 방향으로 바꾸든 경고·확인 질문 없음, 기록만 한다.
// 단 역방향 값(현재가 위 손절 등)은 설정 즉시 도달해 데이터로 무의미하므로 막는다 (판단 개입 아님)
export default function RiskSheet({ kind, avgPrice, currentPrice, current, onClose }: Props) {
  const setRisk = useStore((s) => s.setRisk)
  const ref = useRef<HTMLDialogElement>(null)
  const [pct, setPct] = useState(0)
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const isSl = kind === 'sl'
  const chips = isSl ? [-3, -5, -10] : [5, 10, 20]
  const newV = Number(input) || (pct ? Math.round(avgPrice * (1 + pct / 100)) : 0)
  const pctOf = (v: number) => {
    const p = ((v - avgPrice) / avgPrice) * 100
    return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`
  }

  const save = () => {
    if (!(newV > 0)) return
    if (isSl && newV >= currentPrice) return setMsg('손절가는 현재가보다 낮아야 해요')
    if (!isSl && newV <= currentPrice) return setMsg('목표가는 현재가보다 높아야 해요')
    setRisk(kind, newV)
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div className="sheet-handle" />
      <div style={{ fontSize: 16, fontWeight: 700 }}>
        {isSl ? '손절가' : '목표가'} {current != null ? '수정' : '설정'}
      </div>

      <div className="risk-compare">
        <div className="risk-compare-col">
          <span className="dim" style={{ fontSize: 10 }}>기존</span>
          <span className="dim num" style={{ fontSize: 14, fontWeight: 600 }}>
            {current != null ? `${fmtW(current)} (${pctOf(current)})` : '미설정'}
          </span>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12 H19 M13 6 L19 12 L13 18" />
        </svg>
        <div className="risk-compare-col">
          <span className="dim" style={{ fontSize: 10 }}>새 값</span>
          <span className={`num ${isSl ? 'red' : 'green'}`} style={{ fontSize: 14, fontWeight: 700 }}>
            {newV > 0 ? `${fmtW(newV)} (${pctOf(newV)})` : '—'}
          </span>
        </div>
      </div>

      <div className="qty-chips">
        {chips.map((p) => (
          <button
            key={p}
            className={!input && pct === p ? 'opt selected' : 'opt'}
            style={{ height: 38, fontSize: 12 }}
            onClick={() => { setMsg(''); setPct(p); setInput('') }}
          >
            {p > 0 ? `+${p}%` : `${p}%`}
          </button>
        ))}
        <input
          type="number"
          placeholder="직접 입력"
          value={input}
          onChange={(e) => { setMsg(''); setInput(e.target.value); setPct(0) }}
          style={{ flex: 1.3, minWidth: 0, height: 38, fontSize: 12, textAlign: 'center', marginTop: 0 }}
        />
      </div>

      <button className="pill pill-primary pill-full order-cta" disabled={!(newV > 0)} onClick={save}>
        저장
      </button>
      {msg && <div className="hint-msg center">{msg}</div>}
    </dialog>
  )
}
