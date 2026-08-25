import { useEffect, useRef, useState } from 'react'
import type { ActiveSim, Candle } from '../types'
import { REASONS } from '../types'
import { useStore } from '../store'
import { fmtD, fmtW } from '../lib/data'
import { CAP, FEE, FX } from '../lib/engine'

const PCTS = [25, 50, 75, 100] as const
const SL_PCTS = [-3, -5, -10] as const
const TP_PCTS = [5, 10, 20] as const

interface Props {
  sim: ActiveSim
  currentPrice: number
  candle: Candle // 현재 커서 캔들 — 거래대금 대비 주문 비중 표시용
  buy: boolean // true=매수(OPEN_LONG), false=매도(CLOSE_LONG) — 현물 문법, 숏 없음
  onClose: () => void
}

// 열릴 때만 마운트됨 — 초기 state가 곧 열 때마다의 초기화
export default function OrderSheet({ sim, currentPrice, candle, buy, onClose }: Props) {
  const placeOrder = useStore((s) => s.placeOrder)
  const ref = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const openedAt = useRef(Date.now()) // R6: 시트 열림→제출 소요시간
  const [limit, setLimit] = useState('')
  const [qty, setQty] = useState('')
  const [reasons, setReasons] = useState<string[]>([])
  const [note, setNote] = useState('') // '기타' 선택 시 주관식 근거
  const [foldOpen, setFoldOpen] = useState(false)
  const [slPct, setSlPct] = useState(0)
  const [sl, setSl] = useState('')
  const [tpPct, setTpPct] = useState(0)
  const [tp, setTp] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const side = buy ? 'OPEN_LONG' : 'CLOSE_LONG' // 리터럴 고정 — 문자열 결합 금지 (OPEN_SHORT 유출 방지)
  const limitV = Number(limit) || currentPrice
  const held = sim.positions.LONG?.qty ?? 0
  const pendingSell = sim.openOrders.filter((o) => o.side === 'CLOSE_LONG').reduce((s, o) => s + o.qty, 0)
  const avail = held - pendingSell
  const qtyV = Number(qty) || 0
  // 가격·수량은 버튼 비활성으로, 이유는 눌렀을 때 흔들림으로 알린다 — 이유는 '왜 필수인지'를 보여줘야 하는 값
  const canOrder = qtyV >= 1 && Number(limit) > 0
  const needReason = reasons.length === 0
  const needNote = reasons.includes('기타') && !note.trim()

  const miss = [
    Number(limit) > 0 ? null : '가격',
    qtyV >= 1 ? null : '수량',
  ].filter(Boolean)

  // ponytail: 애니메이션은 index.css @keyframes가 원칙이나, 제출 실패마다 재시작이 필요해 여기만 WAAPI.
  // cancel 없이는 연타 시 Animation이 중첩돼 튄다. 천장: 이 시트 전용.
  // 경로: 재시작이 필요한 곳이 늘면 index.css로 승격
  const shake = (el: HTMLElement | null) => {
    if (!el) return
    el.scrollIntoView({ block: 'nearest' }) // 시트가 스크롤된 상태면 흔들림이 화면 밖에서 일어난다
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.getAnimations().forEach((a) => a.cancel())
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-in-out' },
    )
  }

  const pickPct = (p: number) => {
    const n = buy ? Math.floor((sim.cash * p) / 100 / (limitV * FX * (1 + FEE))) : Math.floor((avail * p) / 100)
    setQty(String(Math.max(0, n)))
  }

  // 주문 명목가가 현재 캔들 거래대금에서 차지하는 비중 — 참여율 상한(CAP)을 넘으면 부분체결 예고
  const tvPct = qtyV >= 1 && candle.v > 0 ? ((qtyV * limitV) / (candle.c * candle.v)) * 100 : null

  const toggleReason = (r: string) => {
    setMsg('')
    const on = reasons.includes(r)
    if (r === '기타' && on) setNote('') // 화면에 없는 텍스트가 저장되는 유령 데이터 방지
    setReasons(on ? reasons.filter((x) => x !== r) : [...reasons, r])
  }

  const pickRisk = (kind: 'sl' | 'tp', p: number) => {
    const cur = kind === 'sl' ? slPct : tpPct
    const on = cur === p
    const val = on ? '' : String(Math.round(limitV * (1 + p / 100)))
    if (kind === 'sl') {
      setSlPct(on ? 0 : p)
      setSl(val)
    } else {
      setTpPct(on ? 0 : p)
      setTp(val)
    }
  }

  const submit = () => {
    const slV = buy ? Number(sl) || undefined : undefined
    const tpV = buy ? Number(tp) || undefined : undefined
    // 방향 검증 — 역방향 리스크 값은 설정 즉시 도달해 데이터로 무의미
    if (slV != null && slV >= limitV) return setMsg('손절가는 지정가보다 낮아야 해요')
    if (tpV != null && tpV <= limitV) return setMsg('목표가는 지정가보다 높아야 해요')
    const err = placeOrder(side, Number(limit), qtyV, { reasons, note: note.trim() || undefined, sl: slV, tp: tpV, ms: Date.now() - openedAt.current })
    if (err) setMsg(err)
    else onClose()
  }

  // ponytail: 가격대별 호가 단위 근사 — $대 종목은 1, 원화대(1만↑)는 100
  const tick = currentPrice < 10000 ? 1 : 100
  const step = (delta: number) =>
    setLimit(String(Math.max(tick, Math.round(((Number(limit) || currentPrice) + delta * tick) * 100) / 100)))

  const riskCaption = (pct: number, val: string) =>
    val ? `${pct ? `${pct > 0 ? '+' : ''}${pct}% → ` : ''}${fmtD(Number(val))}` : ''

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div className="sheet-handle" />
      <div className="sheet-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }} className={buy ? 'green' : 'red'}>
            {buy ? '매수' : '매도'}
          </span>
          <span className="dim" style={{ fontSize: 13 }}>지정가 주문</span>
        </div>
      </div>

      <div className="field-label">지정가</div>
      <div className="stepper">
        <button onClick={() => step(-1)}>−</button>
        <input
          type="number"
          placeholder="가격 입력"
          value={limit}
          onChange={(e) => { setMsg(''); setLimit(e.target.value) }}
        />
        <button onClick={() => step(1)}>+</button>
        <button className="now-btn" onClick={() => setLimit(String(currentPrice))}>현재가</button>
      </div>

      <div className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        수량
        <span className="dim small num" style={{ fontWeight: 400 }}>
          {qtyV >= 1
            ? `${qtyV}주 ≈ ${fmtW(qtyV * limitV * FX)}`
            : buy
              ? `주문 가능 ${fmtW(sim.cash)}`
              : `매도 가능 ${avail}주`}
        </span>
      </div>
      <div className="qty-chips">
        {PCTS.map((p) => (
          <button key={p} className="opt" onClick={() => pickPct(p)}>
            {p === 100 ? 'Max' : `${p}%`}
          </button>
        ))}
      </div>
      <input type="number" min={1} placeholder="직접 입력" value={qty} onChange={(e) => { setMsg(''); setQty(e.target.value) }} />
      {tvPct != null && (
        <div className="num" style={{ fontSize: 11, marginTop: 6, color: tvPct > CAP * 100 ? 'var(--red)' : 'var(--dim)' }}>
          이 주문은 직전 캔들 거래대금의 {tvPct < 0.1 ? '0.1% 미만' : `약 ${tvPct.toFixed(1)}%`}
          {tvPct > CAP * 100 && ' — 한 캔들에 다 체결되지 않고 나눠 체결될 수 있어요'}
        </div>
      )}

      <div className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        왜 이 주문인가요?
        <span className="dim" style={{ fontSize: 10, fontWeight: 400 }}>
          복수 선택 · <b style={{ color: 'var(--red)', fontWeight: 700 }}>필수</b>
        </span>
      </div>
      <div className="reason-chips" ref={reasonRef}>
        {REASONS.map((r) => (
          <button key={r} className={reasons.includes(r) ? 'opt selected' : 'opt'} onClick={() => toggleReason(r)}>
            {r}
          </button>
        ))}
      </div>
      {reasons.includes('기타') && (
        <input
          ref={noteRef}
          maxLength={100}
          placeholder="어떤 근거였는지 짧게 적어주세요"
          value={note}
          onChange={(e) => { setMsg(''); setNote(e.target.value) }}
        />
      )}
      <div className="dim" style={{ fontSize: 11, marginTop: 7 }}>감정도 기록할 가치가 있는 근거예요</div>

      {buy && (
        <div className="risk-fold">
          <button className="risk-fold-head" onClick={() => setFoldOpen(!foldOpen)}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              리스크 설정 <span className="dim" style={{ fontWeight: 400 }}>(선택)</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: foldOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </button>
          {foldOpen && (
            <div className="risk-fold-body">
              {([['sl', '손절가', SL_PCTS, slPct, sl, setSl, setSlPct, 'red'], ['tp', '목표가', TP_PCTS, tpPct, tp, setTp, setTpPct, 'green']] as const).map(
                ([kind, label, pcts, curPct, val, setVal, setPct, tone]) => (
                  <div key={kind}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                      <span className={`num ${tone}`} style={{ fontSize: 11, fontWeight: 600 }}>{riskCaption(curPct, val)}</span>
                    </div>
                    <div className="qty-chips">
                      {pcts.map((p) => (
                        <button key={p} className={curPct === p ? 'opt selected' : 'opt'} style={{ height: 36, fontSize: 12 }} onClick={() => pickRisk(kind, p)}>
                          {p > 0 ? `+${p}%` : `${p}%`}
                        </button>
                      ))}
                      <input
                        type="number"
                        placeholder="직접 입력"
                        value={val}
                        onChange={(e) => { setVal(e.target.value); setPct(0) }}
                        style={{ flex: 1.3, minWidth: 0, height: 36, fontSize: 12, textAlign: 'center', marginTop: 0 }}
                      />
                    </div>
                  </div>
                ),
              )}
              <div className="dim" style={{ fontSize: 11, lineHeight: 1.5 }}>
                자동 체결되지 않아요. 계획과 실제 실행의 차이를 기록하기 위한 값이에요
              </div>
            </div>
          )}
        </div>
      )}

      <button
        className={`pill pill-full order-cta ${buy ? 'pill-long' : 'pill-short'}`}
        disabled={!canOrder}
        onClick={() => {
          if (needReason) { setMsg('주문 이유를 선택해주세요'); return shake(reasonRef.current) }
          if (needNote) { setMsg('기타 근거를 적어주세요'); return shake(noteRef.current) }
          submit()
        }}
      >
        {buy ? '매수하기' : '매도하기'}
      </button>
      {msg ? (
        <div className="hint-msg center warn">{msg}</div>
      ) : !canOrder ? (
        <div className="hint-msg center">{miss.join(' · ')} 입력 후 주문할 수 있어요</div>
      ) : null}
    </dialog>
  )
}
