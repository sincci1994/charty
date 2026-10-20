import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { FEE } from './engine'
import { SPEED_DEFAULT, linePct, nearPrices, pickWeighted, sameCfg, speedOutcome } from './speed'

// engine.test.ts와 같은 픽스처 — (저가, 고가, 종가=고가, 시가=종가)
const candle = (l: number, h: number, c = h, o = c): Candle => ({ ts: 1, o, h, l, c, v: 1e6 })
const E = candle(99, 101, 100) // 진입 캔들 — 종가 100이라 TP는 롱 105 / 숏 95, 손절 3%면 롱 97 / 숏 103
const K = (1 - FEE) / (1 + FEE) // 수수료 왕복 후 남는 비율
const cfg = (period: number, slPct: number | null = null, tpPct: number | null = 5) => ({ period, tpPct, slPct })

describe('speedOutcome — 롱 익절', () => {
  it('TP를 넘은 첫 캔들에서 TP가로 청산하고, 그 뒤 캔들은 보지 않는다', () => {
    const out = speedOutcome([E, candle(99, 104, 103, 100), candle(102, 106, 104, 103), candle(90, 110, 95, 104)], 0, 'long', cfg(3))
    expect(out).toMatchObject({ exitIndex: 2, exitPrice: 105, reason: 'tp' })
    expect(out.ret).toBeCloseTo(1.05 * K - 1, 10)
    // 엔진 왕복과 같은 돈: 판돈 100만으로 수수료 포함 매수 → TP 매도
    expect(1e6 * out.ret).toBeCloseTo((1e6 / (1 + FEE)) * 1.05 * (1 - FEE) - 1e6, 4)
  })
  it('시가가 이미 TP 위로 갭이면 시가에 청산 (엔진 갭 규칙)', () => {
    const out = speedOutcome([E, candle(107, 112, 110, 108)], 0, 'long', cfg(1))
    expect(out).toMatchObject({ exitIndex: 1, exitPrice: 108, reason: 'tp' })
    expect(out.ret).toBeCloseTo(1.08 * K - 1, 10)
  })
  it('고가가 TP에 정확히 닿기만 하면 미도달 — 기간 마지막 종가로 청산', () => {
    const out = speedOutcome([E, candle(98, 105, 102, 100), candle(97, 104, 98, 102)], 0, 'long', cfg(2))
    expect(out).toMatchObject({ exitIndex: 2, exitPrice: 98, reason: 'end' })
    expect(out.ret).toBeCloseTo(0.98 * K - 1, 10)
  })
})

describe('speedOutcome — 롱 손절', () => {
  it('저가가 손절선에 닿기만 해도 손절 (역지정가)', () => {
    const out = speedOutcome([E, candle(97, 102, 100, 100)], 0, 'long', cfg(1, 3))
    expect(out).toMatchObject({ exitIndex: 1, exitPrice: 97, reason: 'sl' })
    expect(out.ret).toBeCloseTo(0.97 * K - 1, 10)
  })
  it('시가가 손절선 아래로 갭이면 시가에 손절 — 손절선보다 더 잃는다', () => {
    const out = speedOutcome([E, candle(93, 96, 94, 95)], 0, 'long', cfg(1, 3))
    expect(out).toMatchObject({ exitPrice: 95, reason: 'sl' })
    expect(out.ret).toBeCloseTo(0.95 * K - 1, 10)
  })
  it('시가가 두 선 사이인데 한 캔들이 둘 다 건드리면 손절 먼저 (순서를 몰라 보수적으로)', () => {
    expect(speedOutcome([E, candle(96, 106, 101, 100)], 0, 'long', cfg(1, 3))).toMatchObject({ exitPrice: 97, reason: 'sl' })
  })
  it('시가가 이미 TP 위로 갭이면 저가가 손절선을 찍어도 익절 — 시가가 그 캔들의 첫 가격', () => {
    const out = speedOutcome([E, candle(96, 108, 100, 106)], 0, 'long', cfg(1, 3))
    expect(out).toMatchObject({ exitPrice: 106, reason: 'tp' })
    expect(out.ret).toBeCloseTo(1.06 * K - 1, 10)
  })
  it('시가가 정확히 TP면 익절이 아니다 — 같은 캔들 저가가 손절선이면 손절', () => {
    expect(speedOutcome([E, candle(96, 107, 100, 105)], 0, 'long', cfg(1, 3))).toMatchObject({ exitPrice: 97, reason: 'sl' })
  })
  it('여러 캔들 중 처음 손절선에 닿은 캔들에서 끝난다', () => {
    const out = speedOutcome([E, candle(98, 104, 101, 100), candle(96, 103, 97, 101), candle(100, 110, 108, 100)], 0, 'long', cfg(3, 3))
    expect(out).toMatchObject({ exitIndex: 2, exitPrice: 97, reason: 'sl' })
  })
  it('손절선 위·TP 미만이면 마감 종가로 청산', () => {
    const out = speedOutcome([E, candle(97.5, 105, 102, 100)], 0, 'long', cfg(1, 3))
    expect(out).toMatchObject({ exitPrice: 102, reason: 'end' })
    expect(out.ret).toBeCloseTo(1.02 * K - 1, 10)
  })
})

describe('speedOutcome — 선이 없을 때', () => {
  it('이익선 없음 — 아무리 올라도 마감 종가로', () => {
    const out = speedOutcome([E, candle(99, 120, 115, 100)], 0, 'long', cfg(1, 3, null))
    expect(out).toMatchObject({ exitPrice: 115, reason: 'end' })
    expect(out.ret).toBeCloseTo(1.15 * K - 1, 10)
  })
  it('손절선 없음 — 아무리 내려도 마감 종가로', () => {
    const out = speedOutcome([E, candle(80, 104, 90, 100)], 0, 'long', cfg(1))
    expect(out).toMatchObject({ exitPrice: 90, reason: 'end' })
    expect(out.ret).toBeCloseTo(0.9 * K - 1, 10)
  })
  it('둘 다 없음 — 롱·숏 모두 마감 종가', () => {
    const c = [E, candle(90, 110, 104, 100)]
    expect(speedOutcome(c, 0, 'long', cfg(1, null, null))).toMatchObject({ exitPrice: 104, reason: 'end' })
    expect(speedOutcome(c, 0, 'long', cfg(1, null, null)).ret).toBeCloseTo(1.04 * K - 1, 10)
    expect(speedOutcome(c, 0, 'short', cfg(1, null, null)).ret).toBeCloseTo(K - 1.04, 10)
  })
})

describe('speedOutcome — 숏', () => {
  it('TP(−5%)를 뚫으면 95에 청산', () => {
    const out = speedOutcome([E, candle(94, 101, 96, 100)], 0, 'short', cfg(1))
    expect(out).toMatchObject({ exitIndex: 1, exitPrice: 95, reason: 'tp' })
    expect(out.ret).toBeCloseTo(K - 0.95, 10)
  })
  it('시가가 TP 아래로 갭이면 시가에 청산', () => {
    const out = speedOutcome([E, candle(88, 93, 91, 92)], 0, 'short', cfg(1))
    expect(out).toMatchObject({ exitPrice: 92, reason: 'tp' })
    expect(out.ret).toBeCloseTo((0.08 - FEE * 1.92) / (1 + FEE), 10)
  })
  it('저가가 TP에 정확히 닿기만 하면 미도달', () => {
    const out = speedOutcome([E, candle(95, 102, 101, 100)], 0, 'short', cfg(1))
    expect(out).toMatchObject({ exitPrice: 101, reason: 'end' })
    expect(out.ret).toBeCloseTo((-0.01 - FEE * 2.01) / (1 + FEE), 10)
  })
  it('고가가 손절선(+3%)에 닿으면 손절', () => {
    const out = speedOutcome([E, candle(98, 103, 100, 100)], 0, 'short', cfg(1, 3))
    expect(out).toMatchObject({ exitPrice: 103, reason: 'sl' })
    expect(out.ret).toBeCloseTo(K - 1.03, 10)
  })
  it('시가가 손절선 위로 갭이면 시가에 손절', () => {
    const out = speedOutcome([E, candle(104, 108, 107, 105)], 0, 'short', cfg(1, 3))
    expect(out).toMatchObject({ exitPrice: 105, reason: 'sl' })
    expect(out.ret).toBeCloseTo(K - 1.05, 10)
  })
  it('한 캔들이 두 선을 다 건드리면 손절 먼저', () => {
    expect(speedOutcome([E, candle(94, 104, 99, 100)], 0, 'short', cfg(1, 3))).toMatchObject({ exitPrice: 103, reason: 'sl' })
  })
  it('시가가 이미 TP 아래로 갭이면 고가가 손절선을 찍어도 익절', () => {
    const out = speedOutcome([E, candle(92, 104, 100, 94)], 0, 'short', cfg(1, 3))
    expect(out).toMatchObject({ exitPrice: 94, reason: 'tp' })
    expect(out.ret).toBeCloseTo(K - 0.94, 10)
  })
  it('급등해도 손실은 판돈까지만 (−1 상한) — 손절이 없을 때도, 갭으로 손절선을 건너뛸 때도', () => {
    expect(speedOutcome([E, candle(100, 300, 300, 100)], 0, 'short', cfg(1)).ret).toBe(-1)
    expect(speedOutcome([E, candle(290, 310, 300, 300)], 0, 'short', cfg(1, 3))).toMatchObject({ exitPrice: 300, reason: 'sl', ret: -1 })
  })
  it('이익선 없음 — 아무리 내려도 마감 종가로', () => {
    const out = speedOutcome([E, candle(80, 101, 85, 100)], 0, 'short', cfg(1, 3, null))
    expect(out).toMatchObject({ exitPrice: 85, reason: 'end' })
    expect(out.ret).toBeCloseTo(K - 0.85, 10)
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
  it('판정 기간 밖의 도달은 무시 — 익절도 손절도', () => {
    expect(speedOutcome([E, candle(99, 101, 100), candle(99, 120, 110)], 0, 'long', cfg(1))).toMatchObject({ exitIndex: 1, exitPrice: 100, reason: 'end' })
    expect(speedOutcome([E, candle(99, 101, 100), candle(90, 101, 95, 100)], 0, 'long', cfg(1, 3))).toMatchObject({ exitIndex: 1, exitPrice: 100, reason: 'end' })
  })
})

describe('linePct — 선 표기', () => {
  it('고르기 전엔 ±, 롱은 목표 +·손절 −, 숏은 목표 −·손절 + (가격 방향), 없음은 부호 없이', () => {
    expect(linePct('tp', 5)).toBe('±5%')
    expect(linePct('tp', 5, 'long')).toBe('+5%')
    expect(linePct('sl', 3, 'long')).toBe('−3%')
    expect(linePct('tp', 5, 'short')).toBe('−5%')
    expect(linePct('sl', 3, 'short')).toBe('+3%')
    expect(linePct('tp', 0.5, 'long')).toBe('+0.5%')
    expect(linePct('sl', null, 'long')).toBe('없음')
    expect(linePct('tp', null)).toBe('없음')
  })
})

describe('sameCfg', () => {
  it('네 항목이 모두 같아야 같은 설정 — 시트를 닫을 때 바뀐 게 있을 때만 다시 뽑는 기준', () => {
    expect(sameCfg(SPEED_DEFAULT, { ...SPEED_DEFAULT })).toBe(true)
    expect(sameCfg(SPEED_DEFAULT, { ...SPEED_DEFAULT, slPct: 3 })).toBe(false)
    expect(sameCfg(SPEED_DEFAULT, { ...SPEED_DEFAULT, tf: '1h' })).toBe(false)
    expect(sameCfg(SPEED_DEFAULT, { ...SPEED_DEFAULT, period: 40 })).toBe(false)
    expect(sameCfg(SPEED_DEFAULT, { ...SPEED_DEFAULT, tpPct: null })).toBe(false)
  })
})

describe('pickWeighted — 종목 고르기', () => {
  it('진입 자리 수에 비례해 뽑고, 자리가 없는 종목은 빼고, 다 없으면 null', () => {
    const spans: [string, number][] = [['A', 1], ['B', 3], ['C', 0]]
    expect(pickWeighted(spans, () => 0)).toBe('A')
    expect(pickWeighted(spans, () => 0.24)).toBe('A')
    expect(pickWeighted(spans, () => 0.26)).toBe('B')
    expect(pickWeighted(spans, () => 0.99)).toBe('B')
    expect(pickWeighted([['C', 0], ['D', -5]], () => 0.5)).toBeNull()
  })
})

describe('nearPrices — 차트 y범위에 넣을 선', () => {
  it('보이는 과거 캔들 폭의 1.5배 안쪽 선만 — 먼 선이 캔들을 한 줄로 누르지 않게', () => {
    const past = [candle(99.5, 100.5, 100), candle(99, 101, 100)] // 진입 100 기준 위아래 1까지 움직였음
    expect(nearPrices(past, 100, [100.5, 101.4, 102, 98.6, 97])).toEqual([100.5, 101.4, 98.6])
  })
})
