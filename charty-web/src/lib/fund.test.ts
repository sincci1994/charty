import { describe, expect, it } from 'vitest'
import type { FundQuarter } from '../types'
import { fmtUsd, fundView, opTransition } from './fund'

const D = 86400
const Q = 91 * D // 분기 간격
// i번째 분기: end = i*Q, 공시 = end + 30일
const q = (i: number, rev: number | null, opInc: number | null, eps: number | null): FundQuarter =>
  ({ endTs: i * Q, filedTs: i * Q + 30 * D, rev, opInc, eps })
const grow = (n: number) => Array.from({ length: n }, (_, k) => q(k + 1, 1000 + k * 100, 100 + k * 10, 1))

describe('fundView — 공시일 필터', () => {
  it('공시 전 분기는 제외 (경계 nowTs = filedTs도 제외)', () => {
    const qs = grow(8)
    const atFiled = fundView(qs, qs[7].filedTs, 40)!
    expect(atFiled.rows[0].rev).toBe(qs[6].rev) // 8번째는 아직 미공시
    const after = fundView(qs, qs[7].filedTs + 1, 40)!
    expect(after.rows[0].rev).toBe(qs[7].rev)
  })
  it('공시된 분기가 없으면 null (2009 이전 구간)', () => {
    expect(fundView(grow(4), 0, 40)).toBeNull()
  })
  it('최근 공시 7일 내면 isNew', () => {
    const qs = grow(5)
    expect(fundView(qs, qs[4].filedTs + D, 40)!.isNew).toBe(true)
    expect(fundView(qs, qs[4].filedTs + 8 * D, 40)!.isNew).toBe(false)
  })
})

describe('fundView — 파생 지표', () => {
  const now = 99 * Q
  it('상대 라벨은 최신부터, 최대 4행', () => {
    const v = fundView(grow(8), now, 40)!
    expect(v.rows.map((r) => r.rel)).toEqual(['최근 분기', '1분기 전', '2분기 전', '3분기 전'])
  })
  it('매출 YoY·영업이익률 (전년 동기 = 4분기 전)', () => {
    const v = fundView(grow(8), now, 40)!
    expect(v.rows[0].revYoy).toBeCloseTo(((1700 - 1300) / 1300) * 100) // 8번째 vs 4번째
    expect(v.rows[0].opMargin).toBeCloseTo((170 / 1700) * 100)
  })
  it('연도 결측 갭이면 YoY 비교 포기', () => {
    const qs = [q(1, 100, 10, 1), q(2, 100, 10, 1), q(3, 100, 10, 1), q(4, 100, 10, 1), q(9, 200, 20, 1)] // 4→9 갭
    expect(fundView(qs, now, 40)!.rows[0].revYoy).toBeNull()
  })
  it('PER = 현재가 ÷ TTM EPS, 적자·분기 부족은 사유와 함께 null', () => {
    expect(fundView(grow(8), now, 40)!.per).toBeCloseTo(10) // TTM = 4
    const loss = fundView(grow(4).map((x) => ({ ...x, eps: -1 })), now, 40)!
    expect(loss.per).toBeNull()
    expect(loss.perNote).toBe('TTM 적자')
    const few = fundView(grow(3), now, 40)!
    expect(few.per).toBeNull()
    expect(few.perNote).toBe('분기 데이터 부족')
  })
})

describe('opTransition', () => {
  it('부호 조합별 % 또는 전환 라벨', () => {
    expect(opTransition(120, 100)).toBeCloseTo(20)
    expect(opTransition(50, -10)).toBe('흑자전환')
    expect(opTransition(-5, 100)).toBe('적자전환')
    expect(opTransition(-5, -10)).toBe('적자지속')
    expect(opTransition(null, 100)).toBeNull()
  })
})

describe('fmtUsd', () => {
  it('B/M 축약과 음수', () => {
    expect(fmtUsd(109_417_000_000)).toBe('$109.4B')
    expect(fmtUsd(20_812_000)).toBe('$21M')
    expect(fmtUsd(-155_392_000)).toBe('-$155M')
  })
})
