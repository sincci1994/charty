import { useEffect, useRef, useState } from 'react'
import type { ActiveSim, Side } from '../types'
import { useStore } from '../store'
import { fmtW } from '../lib/data'

const PCTS = [25, 50, 75, 100] as const

interface Props {
  sim: ActiveSim
  currentPrice: number
  dir: 'LONG' | 'SHORT'
  onClose: () => void
}

// 열릴 때만 마운트됨 — 초기 state가 곧 열 때마다의 초기화
export default function OrderSheet({ sim, currentPrice, dir, onClose }: Props) {
  const placeOrder = useStore((s) => s.placeOrder)
  const ref = useRef<HTMLDialogElement>(null)
  const [oc, setOc] = useState<'OPEN' | 'CLOSE'>('OPEN')
  const [limit, setLimit] = useState('')
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const isLong = dir === 'LONG'
  const side = `${oc}_${dir}` as Side
  const limitV = Number(limit) || currentPrice
  const held = sim.positions[dir]?.qty ?? 0
  const pendingClose = sim.openOrders.filter((o) => o.side === `CLOSE_${dir}`).reduce((s, o) => s + o.qty, 0)
  const avail = held - pendingClose
  const qtyV = Number(qty) || 0
  const canOrder = qtyV >= 1 && Number(limit) > 0

  const pickPct = (p: number) => {
    const n = oc === 'OPEN' ? Math.floor((sim.cash * p) / 100 / limitV) : Math.floor((avail * p) / 100)
    setQty(String(Math.max(0, n)))
  }

  const submit = () => {
    const err = placeOrder(side, Number(limit), qtyV)
    if (err) setMsg(err)
    else onClose()
  }

  // ponytail: 가격대별 호가 단위 근사 — $대 종목은 1, 원화대(1만↑)는 100
  const tick = currentPrice < 10000 ? 1 : 100
  const step = (delta: number) =>
    setLimit(String(Math.max(tick, Math.round(((Number(limit) || currentPrice) + delta * tick) * 100) / 100)))

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
          <span style={{ fontSize: 17, fontWeight: 700 }} className={isLong ? 'green' : 'red'}>
            {isLong ? 'Long' : 'Short'}
          </span>
          <span className="dim" style={{ fontSize: 13 }}>지정가 주문</span>
        </div>
        <div className="seg">
          {(['OPEN', 'CLOSE'] as const).map((k) => (
            <button key={k} className={oc === k ? 'active' : ''} onClick={() => setOc(k)}>
              {k === 'OPEN' ? 'Open' : 'Close'}
            </button>
          ))}
        </div>
      </div>

      <div className="field-label">Limit Price</div>
      <div className="stepper">
        <button onClick={() => step(-1)}>−</button>
        <input
          type="number"
          placeholder="Enter limit price"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
        <button onClick={() => step(1)}>+</button>
        <button className="now-btn" onClick={() => setLimit(String(currentPrice))}>현재가</button>
      </div>

      <div className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        Quantity
        <span className="dim small num" style={{ fontWeight: 400 }}>
          {qtyV >= 1
            ? `${qtyV}주 ≈ ${fmtW(qtyV * limitV)}`
            : oc === 'OPEN'
              ? `주문 가능 ${fmtW(sim.cash)}`
              : `청산 가능 ${avail}주`}
        </span>
      </div>
      <div className="qty-chips">
        {PCTS.map((p) => (
          <button key={p} className="opt" onClick={() => pickPct(p)}>
            {p === 100 ? 'Max' : `${p}%`}
          </button>
        ))}
      </div>
      <input type="number" min={1} placeholder="직접 입력" value={qty} onChange={(e) => setQty(e.target.value)} />

      <button className={`pill pill-full order-cta ${isLong ? 'pill-long' : 'pill-short'}`} disabled={!canOrder} onClick={submit}>
        {oc === 'OPEN' ? 'Open' : 'Close'} {isLong ? 'Long' : 'Short'}
      </button>
      {msg && <div className="hint-msg center">{msg}</div>}
    </dialog>
  )
}
