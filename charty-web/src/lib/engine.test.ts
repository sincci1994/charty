import { describe, expect, it } from 'vitest'
import type { ActiveSim, Candle } from '../types'
import { CAP, FEE, FX, equity, fillOrders, forceCloseAll, validateOrder } from './engine'

const W = (usd: number) => usd * FX // $ → ₩

function sim(over: Partial<ActiveSim> = {}): ActiveSim {
  return {
    id: 's',
    style: 'SCALP',
    symbol: 'QQQ',
    timeframe: '5m',
    startIndex: 0,
    endIndex: 10,
    cursor: 0,
    startBalance: W(10_000),
    cash: W(10_000),
    positions: {},
    openOrders: [],
    trades: [],
    done: false,
    ...over,
  }
}

// v 기본 1e6 — 유동성이 시험 대상이 아닐 땐 상한이 안 걸리게
const candle = (l: number, h: number, c = h, o = c, v = 1e6): Candle => ({ ts: 1, o, h, l, c, v })

describe('fillOrders — 깊이 가중 참여율', () => {
  it('관통하면 체결, 저가 정확히 터치(depth 0)는 미체결, 미도달은 잔류', () => {
    const s = sim({ openOrders: [
      { id: 'a', side: 'OPEN_LONG', price: 100, qty: 10 }, // low 90 관통 → 체결
      { id: 'b', side: 'OPEN_LONG', price: 90, qty: 5 }, // == low 터치 → depth 0 → 잔류
      { id: 'c', side: 'OPEN_LONG', price: 89, qty: 1 }, // < low → 잔류
    ] })
    fillOrders(s, candle(90, 110, 108, 105))
    expect(s.positions.LONG?.qty).toBe(10)
    expect(s.cash).toBeCloseTo(W(10_000) - 100 * 10 * FX * (1 + FEE), 5)
    expect(s.openOrders.map((o) => o.id)).toEqual(['b', 'c'])
  })

  it('체결가능 = floor(v × depth × CAP), 잔량은 다음 캔들로 이월돼 마저 체결', () => {
    // depth = (100-90)/(110-90) = 0.5, v=1000 → 체결가능 floor(1000×0.5×0.1) = 50
    const s = sim({ openOrders: [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 80 }] })
    fillOrders(s, candle(90, 110, 108, 105, 1000))
    expect(s.positions.LONG?.qty).toBe(50)
    expect(s.openOrders[0]).toMatchObject({ id: 'a', qty: 30 })
    fillOrders(s, candle(90, 110, 108, 105, 1000))
    expect(s.positions.LONG?.qty).toBe(80)
    expect(s.openOrders).toEqual([])
  })

  it('같은 캔들의 여러 주문은 v × CAP 예산을 나눠 씀 (선입선출)', () => {
    // v=100 → 캔들 예산 10주. depth 1(지정가가 고가 위)이어도 총 10주만
    const s = sim({ openOrders: [
      { id: 'a', side: 'OPEN_LONG', price: 120, qty: 10 },
      { id: 'b', side: 'OPEN_LONG', price: 120, qty: 5 },
    ] })
    fillOrders(s, candle(90, 110, 108, 105, 100))
    expect(s.positions.LONG?.qty).toBe(10)
    expect(s.openOrders.map((o) => o.id)).toEqual(['b'])
    expect(s.openOrders[0].qty).toBe(5)
  })

  it('현금 부족: 감당 가능한 수량만 체결하고 잔여는 소멸 (좀비 주문 방지)', () => {
    const s = sim({ cash: W(1000), openOrders: [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 20 }] })
    // afford = floor(1000 / (100 × 1.001)) = 9
    fillOrders(s, candle(90, 110, 108, 105))
    expect(s.positions.LONG?.qty).toBe(9)
    expect(s.openOrders).toEqual([])
    expect(s.cash).toBeGreaterThanOrEqual(0)
  })

  it('추가 진입 시 평균단가 재계산', () => {
    const s = sim()
    s.openOrders = [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 10 }]
    fillOrders(s, candle(90, 105))
    s.openOrders = [{ id: 'b', side: 'OPEN_LONG', price: 200, qty: 10 }]
    s.cash = W(10_000)
    fillOrders(s, candle(190, 210))
    expect(s.positions.LONG).toEqual({
      qty: 20,
      avgPrice: 150,
      entries: [{ qty: 10, price: 100 }, { qty: 10, price: 200 }],
    })
  })

  it('구버전 포지션(entries 없음)에 추가 진입해도 동작', () => {
    const s = sim({ positions: { LONG: { qty: 5, avgPrice: 100 } } })
    s.openOrders = [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 5 }]
    fillOrders(s, candle(95, 105))
    expect(s.positions.LONG?.qty).toBe(10)
    expect(s.positions.LONG?.entries).toEqual([{ qty: 5, price: 100 }])
  })

  it('갭 체결: 시가가 지정가보다 유리하면 시가로 체결', () => {
    // 매수 갭다운 — 캔들 전체(80~90)가 지정가 100 아래여도 시가 82로 체결
    const s = sim()
    s.openOrders = [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 10 }]
    fillOrders(s, candle(80, 90, 85, 82))
    expect(s.positions.LONG).toMatchObject({ qty: 10, avgPrice: 82 })
    expect(s.cash).toBeCloseTo(W(10_000) - 82 * 10 * FX * (1 + FEE), 5)
    expect(s.trades.at(-1)?.price).toBe(82)
    // 매도(숏 진입) 갭업 — 캔들 전체(110~120)가 지정가 100 위여도 시가 112로 체결
    const s2 = sim()
    s2.openOrders = [{ id: 'b', side: 'OPEN_SHORT', price: 100, qty: 10 }]
    fillOrders(s2, candle(110, 120, 115, 112))
    expect(s2.positions.SHORT).toMatchObject({ qty: 10, avgPrice: 112 })
  })

  it('숏 청산 손익(₩): 진입가보다 싸게 되사면 이익, 수수료는 현금에만', () => {
    const s = sim({ cash: 100 * 10 * FX * (1 + FEE) })
    s.openOrders = [{ id: 'a', side: 'OPEN_SHORT', price: 100, qty: 10 }]
    fillOrders(s, candle(95, 105, 105, 98)) // 시가 98 < 지정가 → 지정가 100 체결, 증거금+수수료 전액 잠김
    expect(s.cash).toBeCloseTo(0, 5)
    s.openOrders = [{ id: 'b', side: 'CLOSE_SHORT', price: 80, qty: 10 }]
    fillOrders(s, candle(75, 85))
    // 증거금 1000 + 이익 200 − 청산 명목가 수수료 0.8 (달러 기준, ₩ 환산)
    expect(s.cash).toBeCloseTo(W(1200 - FEE * 80 * 10), 5)
    expect(s.positions.SHORT).toBeUndefined()
    expect(s.trades.at(-1)?.pnl).toBeCloseTo(W(200), 5)
  })
})

describe('validateOrder', () => {
  it('현금(수수료 포함) 초과 진입 거부, 보유량 초과 청산 거부', () => {
    const s = sim({ cash: 100 * 5 * FX * (1 + FEE), positions: { LONG: { qty: 5, avgPrice: 100 } } })
    expect(validateOrder(s, 'OPEN_LONG', 100, 6)).toBeTruthy()
    expect(validateOrder(s, 'OPEN_LONG', 100, 5)).toBeNull()
    expect(validateOrder(s, 'CLOSE_LONG', 100, 6)).toBeTruthy()
    s.openOrders = [{ id: 'x', side: 'CLOSE_LONG', price: 100, qty: 3 }]
    expect(validateOrder(s, 'CLOSE_LONG', 100, 3)).toBeTruthy() // 미체결 청산 3 + 신규 3 > 보유 5
    expect(validateOrder(s, 'CLOSE_LONG', 100, 2)).toBeNull()
  })
})

describe('forceCloseAll / equity', () => {
  it('종가 강제 청산(유동성 예외·전량) — cash = 평가액 − 청산 수수료', () => {
    const s = sim({
      cash: W(1000),
      positions: { LONG: { qty: 10, avgPrice: 100 }, SHORT: { qty: 5, avgPrice: 200 } },
      openOrders: [{ id: 'a', side: 'OPEN_LONG', price: 1, qty: 1 }],
    })
    const last = candle(148, 152, 150)
    const evaluated = equity(s, 150) // (1000 + 10×150 + 5×(400−150)) × FX
    forceCloseAll(s, last)
    expect(evaluated).toBe(W(3750))
    expect(s.cash).toBeCloseTo(W(3750 - FEE * 150 * 15), 5) // 청산 명목가 150×15의 수수료만 차이
    expect(s.done).toBe(true)
    expect(s.openOrders).toEqual([])
    expect(s.positions).toEqual({})
  })
})

describe('상수', () => {
  it('CAP·FEE·FX 부호 방어 — 실수 변경 감지', () => {
    expect(CAP).toBeGreaterThan(0)
    expect(CAP).toBeLessThanOrEqual(1)
    expect(FEE).toBeGreaterThanOrEqual(0)
    expect(FEE).toBeLessThan(0.01)
    expect(FX).toBeGreaterThan(1)
  })
})

describe('note — 기타 주관식 근거 배관', () => {
  it('매수·매도 체결 Trade에 note가 실린다', () => {
    const s = sim({
      positions: { LONG: { qty: 5, avgPrice: 100 } },
      openOrders: [
        { id: 'a', side: 'OPEN_LONG', price: 100, qty: 2, reasons: ['기타'], note: '눌림목 매수' },
        { id: 'b', side: 'CLOSE_LONG', price: 105, qty: 5, reasons: ['기타'], note: '목표 도달' },
      ],
    })
    fillOrders(s, candle(90, 110))
    expect(s.trades.map((t) => t.note)).toEqual(['눌림목 매수', '목표 도달'])
  })
  it('유동성 부족으로 두 캔들에 나눠 체결돼도 각 Trade에 note가 실린다', () => {
    const s = sim({ openOrders: [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 20, reasons: ['기타'], note: '분할 매수' }] })
    fillOrders(s, candle(90, 110, 108, 105, 100)) // v=100 → CAP 10% = 10주만
    fillOrders(s, candle(90, 110, 108, 105, 100))
    expect(s.trades).toHaveLength(2)
    expect(s.trades.every((t) => t.note === '분할 매수')).toBe(true)
  })
  it('세션 종료 강제 청산은 사용자 판단이 아니므로 note가 없다', () => {
    const s = sim({ positions: { LONG: { qty: 5, avgPrice: 100 } } })
    forceCloseAll(s, candle(90, 110))
    expect(s.trades[0].note).toBeUndefined()
  })
})
