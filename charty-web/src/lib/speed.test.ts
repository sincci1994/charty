import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { FEE } from './engine'
import { speedOutcome } from './speed'

// engine.test.ts와 같은 픽스처 — (저가, 고가, 종가=고가, 시가=종가)
const candle = (l: number, h: number, c = h, o = c): Candle => ({ ts: 1, o, h, l, c, v: 1e6 })
const E = candle(99, 101, 100) // 진입 캔들 — 종가 100이라 TP는 롱 105 / 숏 95
const K = (1 - FEE) / (1 + FEE) // 수수료 왕복 후 남는 비율
const cfg = (period: number) => ({ period, tpPct: 5 })

describe('speedOutcome — 롱', () => {
  it('TP를 넘은 첫 캔들에서 TP가로 청산하고, 그 뒤 캔들은 보지 않는다', () => {
    const out = speedOutcome([E, candle(99, 104, 103, 100), candle(102, 106, 104, 103), candle(90, 110, 95, 104)], 0, 'long', cfg(3))
    expect(out).toMatchObject({ exitIndex: 2, exitPrice: 105, hitTp: true })
    expect(out.ret).toBeCloseTo(1.05 * K - 1, 10)
    // 엔진 왕복과 같은 돈: 판돈 100만으로 수수료 포함 매수 → TP 매도
    expect(1e6 * out.ret).toBeCloseTo((1e6 / (1 + FEE)) * 1.05 * (1 - FEE) - 1e6, 4)
  })
  it('시가가 이미 TP 위로 갭이면 시가에 청산 (엔진 갭 규칙)', () => {
    const out = speedOutcome([E, candle(107, 112, 110, 108)], 0, 'long', cfg(1))
    expect(out).toMatchObject({ exitIndex: 1, exitPrice: 108, hitTp: true })
    expect(out.ret).toBeCloseTo(1.08 * K - 1, 10)
  })
  it('고가가 TP에 정확히 닿기만 하면 미도달 — 기간 마지막 종가로 청산', () => {
    const out = speedOutcome([E, candle(98, 105, 102, 100), candle(97, 104, 98, 102)], 0, 'long', cfg(2))
    expect(out).toMatchObject({ exitIndex: 2, exitPrice: 98, hitTp: false })
    expect(out.ret).toBeCloseTo(0.98 * K - 1, 10)
  })
})

describe('speedOutcome — 숏', () => {
  it('TP(−5%)를 뚫으면 95에 청산', () => {
    const out = speedOutcome([E, candle(94, 101, 96, 100)], 0, 'short', cfg(1))
    expect(out).toMatchObject({ exitIndex: 1, exitPrice: 95, hitTp: true })
    expect(out.ret).toBeCloseTo(K - 0.95, 10)
  })
  it('시가가 TP 아래로 갭이면 시가에 청산', () => {
    const out = speedOutcome([E, candle(88, 93, 91, 92)], 0, 'short', cfg(1))
    expect(out).toMatchObject({ exitPrice: 92, hitTp: true })
    expect(out.ret).toBeCloseTo((0.08 - FEE * 1.92) / (1 + FEE), 10)
  })
  it('저가가 TP에 정확히 닿기만 하면 미도달', () => {
    const out = speedOutcome([E, candle(95, 102, 101, 100)], 0, 'short', cfg(1))
    expect(out).toMatchObject({ exitPrice: 101, hitTp: false })
    expect(out.ret).toBeCloseTo((-0.01 - FEE * 2.01) / (1 + FEE), 10)
  })
  it('급등해도 손실은 판돈까지만 (−1 상한)', () => {
    expect(speedOutcome([E, candle(100, 300, 300, 100)], 0, 'short', cfg(1)).ret).toBe(-1)
  })
})

describe('speedOutcome — 공통', () => {
  it('제자리면 롱·숏 모두 수수료만큼 손실 (X)', () => {
    for (const dir of ['long', 'short'] as const) {
      const out = speedOutcome([E, candle(99, 101, 100)], 0, dir, cfg(1))
      expect(out.ret).toBeCloseTo(K - 1, 10)
      expect(out.ret).toBeLessThan(0)
    }
  })
  it('판정 기간 밖의 TP 도달은 무시', () => {
    const out = speedOutcome([E, candle(99, 101, 100), candle(99, 120, 110)], 0, 'long', cfg(1))
    expect(out).toMatchObject({ exitIndex: 1, exitPrice: 100, hitTp: false })
  })
})
