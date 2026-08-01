import { useState } from 'react'
import type { ActiveSim, Side } from '../types'
import { useStore } from '../store'

const SIDE_LABEL: Record<Side, string> = {
  OPEN_LONG: '롱 진입',
  CLOSE_LONG: '롱 청산',
  OPEN_SHORT: '숏 진입',
  CLOSE_SHORT: '숏 청산',
}

interface Props {
  sim: ActiveSim
  currentPrice: number
}

export default function OrderPanel({ sim, currentPrice }: Props) {
  const placeOrder = useStore((s) => s.placeOrder)
  const cancelOrder = useStore((s) => s.cancelOrder)
  const [tab, setTab] = useState<'order' | 'position' | 'open'>('order')
  const [side, setSide] = useState<Side>('OPEN_LONG')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')

  const submit = () => {
    const err = placeOrder(side, Number(price), Number(qty))
    if (err) {
      setMsg(err)
    } else {
      setMsg(`${SIDE_LABEL[side]} 주문 등록됨`)
      setPrice('')
      setQty('')
    }
  }

  const pnlOf = (avg: number, qty: number, sign: 1 | -1) => sign * (currentPrice - avg) * qty

  return (
    <div className="card">
      <div className="tabs">
        {(['order', 'position', 'open'] as const).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t === 'order' ? '주문' : t === 'position' ? '포지션' : `미체결 (${sim.openOrders.length})`}
          </button>
        ))}
      </div>

      {tab === 'order' && (
        <div className="order-form">
          <div className="side-grid">
            {(Object.keys(SIDE_LABEL) as Side[]).map((s) => (
              <button
                key={s}
                className={`side-btn ${s.includes('LONG') ? 'long' : 'short'} ${side === s ? 'selected' : ''}`}
                onClick={() => setSide(s)}
              >
                {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="input-row">
            <input
              type="number"
              placeholder={`지정가 (현재 ${currentPrice.toFixed(2)})`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <button className="ghost-btn" onClick={() => setPrice(currentPrice.toFixed(2))}>현재가</button>
          </div>
          <input
            type="number"
            placeholder="수량 (정수)"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <button className="primary-btn" onClick={submit}>주문</button>
          {msg && <div className="hint-msg">{msg}</div>}
        </div>
      )}

      {tab === 'position' &&
        ((['LONG', 'SHORT'] as const).some((k) => sim.positions[k]) ? (
          <table className="table">
            <thead>
              <tr><th>방향</th><th>수량</th><th>평단</th><th>평가손익</th></tr>
            </thead>
            <tbody>
              {(['LONG', 'SHORT'] as const).map((k) => {
                const p = sim.positions[k]
                if (!p) return null
                const pnl = pnlOf(p.avgPrice, p.qty, k === 'LONG' ? 1 : -1)
                return (
                  <tr key={k}>
                    <td className={k === 'LONG' ? 'green' : 'red'}>{k === 'LONG' ? '롱' : '숏'}</td>
                    <td>{p.qty}</td>
                    <td>{p.avgPrice.toFixed(2)}</td>
                    <td className={pnl >= 0 ? 'green' : 'red'}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">보유 포지션 없음</div>
        ))}

      {tab === 'open' &&
        (sim.openOrders.length > 0 ? (
          <table className="table">
            <thead>
              <tr><th>주문</th><th>지정가</th><th>수량</th><th></th></tr>
            </thead>
            <tbody>
              {sim.openOrders.map((o) => (
                <tr key={o.id}>
                  <td className={o.side.includes('LONG') ? 'green' : 'red'}>{SIDE_LABEL[o.side]}</td>
                  <td>{o.price.toFixed(2)}</td>
                  <td>{o.qty}</td>
                  <td><button className="ghost-btn" onClick={() => cancelOrder(o.id)}>취소</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">미체결 주문 없음</div>
        ))}
    </div>
  )
}
