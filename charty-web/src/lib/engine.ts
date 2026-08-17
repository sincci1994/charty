import type { ActiveSim, Candle, Order, Side } from '../types'

// 체결·포지션·손익 계산 — 전부 순수하게 sim을 직접 변형한다.
// 호출측(store)에서 structuredClone 후 넘길 것.
// 단위 규약: 가격·평단·지정가는 $ (캔들 원값), 현금·총자산·pnl은 ₩ — 환전은 체결·평가 경계에서만.

// ponytail: FX는 고정 근사 환율 — 당시 환율 반영이 필요해지면 econ.json KRW 시계열로 교체
export const FX = 1400 // $ → ₩
export const FEE = 0.001 // 편도 수수료 0.1% (슬리피지는 지정가 전용이라 없음 — 시장가 도입 시 함께)
export const CAP = 0.1 // 캔들 거래량 참여율 상한 — 깊이 가중과 곱해져 체결 가능 수량을 만든다

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

function execute(sim: ActiveSim, o: Order, ts: number, price: number, qty: number) {
  const { side } = o
  if (side === 'OPEN_LONG' || side === 'OPEN_SHORT') {
    // ponytail: 숏도 진입금액만큼 증거금을 잠근다 (무한 공매도 방지)
    const cost = price * qty * FX * (1 + FEE)
    if (sim.cash < cost) return // 체결 시점 잔고 부족 → 미체결 (fillOrders가 수량을 현금에 맞춰 줄여서 옴)
    sim.cash -= cost
    const key = side === 'OPEN_LONG' ? 'LONG' : 'SHORT'
    mergePosition(sim, key, qty, price)
    // 주문의 리스크 계획을 포지션에 반영 (마지막 체결 우선) — sl이 실제로 바뀔 때만 도달 기록 리셋
    const pos = sim.positions[key]!
    if (o.sl != null) {
      if (pos.sl !== o.sl) pos.slHit = false
      pos.sl = o.sl
    }
    if (o.tp != null) pos.tp = o.tp
    sim.trades.push({ ts, side, price, qty, reasons: o.reasons, sl: o.sl, tp: o.tp })
  } else {
    const key = side === 'CLOSE_LONG' ? 'LONG' : 'SHORT'
    const pos = sim.positions[key]
    if (!pos) return
    const q = Math.min(qty, pos.qty)
    if (key === 'LONG') {
      sim.cash += price * q * FX * (1 - FEE)
      sim.trades.push({ ts, side, price, qty: q, pnl: (price - pos.avgPrice) * q * FX, reasons: o.reasons })
    } else {
      // 증거금(avgPrice*q) 반환 + 손익(avgPrice - price)*q − 청산 명목가 수수료
      sim.cash += (2 * pos.avgPrice - price - FEE * price) * q * FX
      sim.trades.push({ ts, side, price, qty: q, pnl: (pos.avgPrice - price) * q * FX })
    }
    shrinkPosition(sim, key, q)
  }
}

// Next Candle: 지정가 도달 시 지정가로, 시가가 지정가보다 유리하면(갭) 시가로 체결.
// 수량은 깊이 가중 참여율로 제한 — 체결가능 = floor(v × depth × CAP),
// depth = 내 지정가보다 유리한 가격으로 거래된 봉 구간 비율. 저가/고가를 정확히
// 터치한 봉은 depth 0 → 미체결 (실전의 호가 큐). 유동성 부족분은 다음 캔들로
// 이월(부분체결), 매수 현금 부족분은 소멸 — 기존 소멸 의미 유지.
export function fillOrders(sim: ActiveSim, candle: Candle) {
  const remaining: Order[] = []
  const range = candle.h - candle.l
  let budget = Math.floor(candle.v * CAP) // 같은 캔들의 여러 주문이 나눠 쓰는 체결 예산
  for (const o of sim.openOrders) {
    const buy = o.side === 'OPEN_LONG' || o.side === 'CLOSE_SHORT'
    const hit = buy ? candle.l <= o.price : candle.h >= o.price
    if (!hit) { remaining.push(o); continue }
    // 일자봉은 hit이면 봉 전체가 내 가격 이상 유리한 거래 — depth 1
    const depth = range === 0 ? 1 : Math.min(1, (buy ? o.price - candle.l : candle.h - o.price) / range)
    const px = buy ? Math.min(candle.o, o.price) : Math.max(candle.o, o.price)
    let q = Math.min(o.qty, Math.floor(candle.v * depth * CAP), budget)
    let cashBound = false
    if (o.side === 'OPEN_LONG' || o.side === 'OPEN_SHORT') {
      const afford = Math.floor(sim.cash / (px * FX * (1 + FEE)))
      if (afford < q) { q = afford; cashBound = true }
    }
    if (q > 0) { execute(sim, o, candle.ts, px, q); budget -= q }
    const left = o.qty - q
    if (left > 0 && !cashBound) { o.qty = left; remaining.push(o) }
  }
  sim.openOrders = remaining
}

// 주문 검증. 문제 있으면 에러 메시지, 없으면 null
export function validateOrder(sim: ActiveSim, side: Side, price: number, qty: number): string | null {
  if (!(price > 0)) return '가격을 입력하세요'
  if (!Number.isInteger(qty) || qty < 1) return '수량은 1 이상 정수'
  if (side === 'OPEN_LONG' || side === 'OPEN_SHORT') {
    if (price * qty * FX * (1 + FEE) > sim.cash) return '현금이 부족합니다'
  } else {
    const key = side === 'CLOSE_LONG' ? 'LONG' : 'SHORT'
    const held = sim.positions[key]?.qty ?? 0
    const pending = sim.openOrders
      .filter((o) => o.side === side)
      .reduce((s, o) => s + o.qty, 0)
    if (qty + pending > held) return side === 'CLOSE_LONG' ? '매도 가능 수량 초과' : '청산 가능 수량 초과'
  }
  return null
}

// 총자산 평가 (현재가 기준, ₩)
export function equity(sim: ActiveSim, price: number): number {
  let e = sim.cash
  const l = sim.positions.LONG
  if (l) e += l.qty * price * FX
  const s = sim.positions.SHORT
  if (s) e += s.qty * (2 * s.avgPrice - price) * FX // 증거금 + 미실현손익
  return e
}

// 종료 시 잔여 포지션 전량 종가 청산 + 미체결 주문 취소.
// 유동성(참여율 상한) 예외 — 세션 종료는 항상 성립해야 하므로 전량 체결, 매도 수수료만 적용
export function forceCloseAll(sim: ActiveSim, candle: Candle) {
  sim.openOrders = []
  const l = sim.positions.LONG
  if (l) {
    sim.cash += candle.c * l.qty * FX * (1 - FEE)
    sim.trades.push({ ts: candle.ts, side: 'CLOSE_LONG', price: candle.c, qty: l.qty, pnl: (candle.c - l.avgPrice) * l.qty * FX, forced: true })
    delete sim.positions.LONG
  }
  const s = sim.positions.SHORT
  if (s) {
    sim.cash += (2 * s.avgPrice - candle.c - FEE * candle.c) * s.qty * FX
    sim.trades.push({ ts: candle.ts, side: 'CLOSE_SHORT', price: candle.c, qty: s.qty, pnl: (s.avgPrice - candle.c) * s.qty * FX, forced: true })
    delete sim.positions.SHORT
  }
  sim.done = true
}
