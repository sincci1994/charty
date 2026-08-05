import { describe, expect, it } from 'vitest'
import type { ActiveSim, Candle } from '../types'
import { equity, fillOrders, forceCloseAll, validateOrder } from './engine'

function sim(over: Partial<ActiveSim> = {}): ActiveSim {
  return {
    id: 's',
    style: 'SCALP',
    symbol: 'QQQ',
    timeframe: '5m',
    startIndex: 0,
    endIndex: 10,
    cursor: 0,
    startBalance: 10000,
    cash: 10000,
    positions: {},
    openOrders: [],
    trades: [],
    done: false,
    ...over,
  }
}

const candle = (l: number, h: number, c = h, o = c): Candle => ({ ts: 1, o, h, l, c, v: 100 })

describe('fillOrders', () => {
  it('저가~고가 경계 포함 시 체결, 벗어나면 미체결', () => {
    const s = sim({ openOrders: [
      { id: 'a', side: 'OPEN_LONG', price: 100, qty: 10 }, // == low → 체결 (비용 1000)
      { id: 'b', side: 'OPEN_LONG', price: 110, qty: 100 }, // 체결가 min(시가 110, 지정가 110)=110, 비용 11000 > 잔고 9000 → 소멸
      { id: 'c', side: 'OPEN_LONG', price: 99.99, qty: 1 }, // < low → 잔류
    ] })
    fillOrders(s, candle(100, 110))
    expect(s.positions.LONG?.qty).toBe(10)
    expect(s.cash).toBe(9000)
    expect(s.openOrders.map((o) => o.id)).toEqual(['c'])
  })

  it('추가 진입 시 평균단가 재계산', () => {
    const s = sim({ cash: 10000 })
    s.openOrders = [{ id: 'a', side: 'OPEN_LONG', price: 100, qty: 10 }]
    fillOrders(s, candle(90, 105))
    s.openOrders = [{ id: 'b', side: 'OPEN_LONG', price: 200, qty: 10 }]
    s.cash = 10000
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
    expect(s.cash).toBe(10000 - 820)
    expect(s.trades.at(-1)?.price).toBe(82)
    // 매도(숏 진입) 갭업 — 캔들 전체(110~120)가 지정가 100 위여도 시가 112로 체결
    const s2 = sim()
    s2.openOrders = [{ id: 'b', side: 'OPEN_SHORT', price: 100, qty: 10 }]
    fillOrders(s2, candle(110, 120, 115, 112))
    expect(s2.positions.SHORT).toMatchObject({ qty: 10, avgPrice: 112 })
  })

  it('숏 청산 손익: 진입가보다 싸게 되사면 이익', () => {
    const s = sim({ cash: 1000 })
    s.openOrders = [{ id: 'a', side: 'OPEN_SHORT', price: 100, qty: 10 }]
    fillOrders(s, candle(95, 105, 105, 98)) // 시가 98 < 지정가 → 지정가 100 체결, 증거금 1000 잠김 → cash 0
    expect(s.cash).toBe(0)
    s.openOrders = [{ id: 'b', side: 'CLOSE_SHORT', price: 80, qty: 10 }]
    fillOrders(s, candle(75, 85))
    expect(s.cash).toBe(1200) // 증거금 1000 + 이익 200
    expect(s.positions.SHORT).toBeUndefined()
    expect(s.trades.at(-1)?.pnl).toBe(200)
  })
})

describe('validateOrder', () => {
  it('현금 초과 진입 거부, 보유량 초과 청산 거부', () => {
    const s = sim({ cash: 500, positions: { LONG: { qty: 5, avgPrice: 100 } } })
    expect(validateOrder(s, 'OPEN_LONG', 100, 6)).toBeTruthy()
    expect(validateOrder(s, 'OPEN_LONG', 100, 5)).toBeNull()
    expect(validateOrder(s, 'CLOSE_LONG', 100, 6)).toBeTruthy()
    s.openOrders = [{ id: 'x', side: 'CLOSE_LONG', price: 100, qty: 3 }]
    expect(validateOrder(s, 'CLOSE_LONG', 100, 3)).toBeTruthy() // 미체결 청산 3 + 신규 3 > 보유 5
    expect(validateOrder(s, 'CLOSE_LONG', 100, 2)).toBeNull()
  })
})

describe('forceCloseAll / equity', () => {
  it('종가 강제 청산 후 cash가 평가액과 일치', () => {
    const s = sim({
      cash: 1000,
      positions: { LONG: { qty: 10, avgPrice: 100 }, SHORT: { qty: 5, avgPrice: 200 } },
      openOrders: [{ id: 'a', side: 'OPEN_LONG', price: 1, qty: 1 }],
    })
    const last = candle(148, 152, 150)
    const evaluated = equity(s, 150) // 1000 + 10*150 + 5*(400-150) = 3750
    forceCloseAll(s, last)
    expect(evaluated).toBe(3750)
    expect(s.cash).toBe(3750)
    expect(s.done).toBe(true)
    expect(s.openOrders).toEqual([])
    expect(s.positions).toEqual({})
  })
})
