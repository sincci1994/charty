import type { ActiveSim, Candle, Order, Side } from '../types'

// 체결·포지션·손익 계산 — 전부 순수하게 sim을 직접 변형한다.
// 호출측(store)에서 structuredClone 후 넘길 것.

function mergePosition(sim: ActiveSim, key: 'LONG' | 'SHORT', qty: number, price: number) {
  const pos = sim.positions[key]
  if (!pos) {
    sim.positions[key] = { qty, avgPrice: price, entries: [{ qty, price }] }
  } else {
    const total = pos.qty + qty
    pos.avgPrice = (pos.avgPrice * pos.qty + price * qty) / total
    pos.qty = total
    // ponytail: entries는 append-only 진입 로그 — 부분청산 FIFO 차감이 필요해지면 shrinkPosition에서 처리
    ;(pos.entries ??= []).push({ qty, price })
  }
}

function shrinkPosition(sim: ActiveSim, key: 'LONG' | 'SHORT', qty: number) {
  const pos = sim.positions[key]
  if (!pos) return
  pos.qty -= qty
  if (pos.qty <= 0) delete sim.positions[key]
}

function execute(sim: ActiveSim, o: Order, ts: number) {
  const { side, price, qty } = o
  if (side === 'OPEN_LONG' || side === 'OPEN_SHORT') {
    // ponytail: 숏도 진입금액만큼 증거금을 잠근다 (무한 공매도 방지)
    const cost = price * qty
    if (sim.cash < cost) return // 체결 시점 잔고 부족 → 주문 소멸
    sim.cash -= cost
    mergePosition(sim, side === 'OPEN_LONG' ? 'LONG' : 'SHORT', qty, price)
    sim.trades.push({ ts, side, price, qty, reasons: o.reasons })
  } else {
    const key = side === 'CLOSE_LONG' ? 'LONG' : 'SHORT'
    const pos = sim.positions[key]
    if (!pos) return
    const q = Math.min(qty, pos.qty)
    if (key === 'LONG') {
      sim.cash += price * q
      sim.trades.push({ ts, side, price, qty: q, pnl: (price - pos.avgPrice) * q, reasons: o.reasons })
    } else {
      // 증거금(avgPrice*q) 반환 + 손익(avgPrice - price)*q
      sim.cash += (2 * pos.avgPrice - price) * q
      sim.trades.push({ ts, side, price, qty: q, pnl: (pos.avgPrice - price) * q, reasons: o.reasons })
    }
    shrinkPosition(sim, key, q)
  }
}

// Next Candle: 새 캔들의 저가~고가 범위에 지정가가 들어오면 지정가로 체결
export function fillOrders(sim: ActiveSim, candle: Candle) {
  const remaining: Order[] = []
  for (const o of sim.openOrders) {
    if (candle.l <= o.price && o.price <= candle.h) execute(sim, o, candle.ts)
    else remaining.push(o)
  }
  sim.openOrders = remaining
}

// 주문 검증. 문제 있으면 에러 메시지, 없으면 null
export function validateOrder(sim: ActiveSim, side: Side, price: number, qty: number): string | null {
  if (!(price > 0)) return '가격을 입력하세요'
  if (!Number.isInteger(qty) || qty < 1) return '수량은 1 이상 정수'
  if (side === 'OPEN_LONG' || side === 'OPEN_SHORT') {
    if (price * qty > sim.cash) return '현금이 부족합니다'
  } else {
    const key = side === 'CLOSE_LONG' ? 'LONG' : 'SHORT'
    const held = sim.positions[key]?.qty ?? 0
    const pending = sim.openOrders
      .filter((o) => o.side === side)
      .reduce((s, o) => s + o.qty, 0)
    if (qty + pending > held) return '청산 가능 수량 초과'
  }
  return null
}

// 총자산 평가 (현재가 기준)
export function equity(sim: ActiveSim, price: number): number {
  let e = sim.cash
  const l = sim.positions.LONG
  if (l) e += l.qty * price
  const s = sim.positions.SHORT
  if (s) e += s.qty * (2 * s.avgPrice - price) // 증거금 + 미실현손익
  return e
}

// 종료 시 잔여 포지션 전량 종가 청산 + 미체결 주문 취소
export function forceCloseAll(sim: ActiveSim, candle: Candle) {
  sim.openOrders = []
  const l = sim.positions.LONG
  if (l) {
    sim.cash += candle.c * l.qty
    sim.trades.push({ ts: candle.ts, side: 'CLOSE_LONG', price: candle.c, qty: l.qty, pnl: (candle.c - l.avgPrice) * l.qty })
    delete sim.positions.LONG
  }
  const s = sim.positions.SHORT
  if (s) {
    sim.cash += (2 * s.avgPrice - candle.c) * s.qty
    sim.trades.push({ ts: candle.ts, side: 'CLOSE_SHORT', price: candle.c, qty: s.qty, pnl: (s.avgPrice - candle.c) * s.qty })
    delete sim.positions.SHORT
  }
  sim.done = true
}
