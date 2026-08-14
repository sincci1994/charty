import { describe, expect, it } from 'vitest'
import { SETS, avatarSrc, fmtDur, normalizeCounts, resampleCandles } from './data'
import type { Candle } from '../types'

// 13:00 UTC(1h 버킷 경계) 기준 5분봉 생성
const c5 = (i: number): Candle => ({ ts: 46800 + i * 300, o: 100 + i, h: 110 + i, l: 90 + i, c: 105 + i, v: 10 })

describe('resampleCandles', () => {
  it('5m 12개 → 1h 1개로 집계한다', () => {
    const out = resampleCandles(Array.from({ length: 12 }, (_, i) => c5(i)), 3600)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ ts: 46800, o: 100, h: 121, l: 90, c: 116, v: 120 }) // ts=버킷 시작(13:00), o=첫, h=max, l=min, c=끝, v=합
  })

  it('마지막 버킷은 부분 캔들로 남는다', () => {
    const out = resampleCandles(Array.from({ length: 15 }, (_, i) => c5(i)), 3600)
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ ts: 50400, o: 112, h: 124, l: 102, c: 119, v: 30 }) // 14:00 버킷에 5m 3개만
  })

  it('버킷 경계는 floor(ts/tfSec) 정렬이다', () => {
    const out = resampleCandles([c5(1)], 900) // 13:05 캔들
    expect(out[0].ts).toBe(46800) // 13:00 버킷 시작으로 내림 정렬
  })
})

describe('fmtDur', () => {
  it('시간·일·개월·년 경계', () => {
    expect(fmtDur(6 * 3600)).toBe('약 6시간')
    expect(fmtDur(5 * 86400)).toBe('약 5일')
    expect(fmtDur(102 * 86400)).toBe('약 3개월 12일')
    expect(fmtDur(455 * 86400)).toBe('약 1년 3개월')
  })
  it('0 나머지는 생략', () => {
    expect(fmtDur(60 * 86400)).toBe('약 2개월')
    expect(fmtDur(365 * 86400)).toBe('약 1년')
  })
  it('1시간 미만도 최소 1시간', () => {
    expect(fmtDur(60)).toBe('약 1시간')
  })
})

describe('normalizeCounts', () => {
  it('종목별 형식: 15m/30m/4h를 기본 TF에서 나눗셈으로 파생', () => {
    const out = normalizeCounts({ QQQ: { '5m': 600, '1h': 400, '1d': 5000, '1w': 1000 } })!
    expect(out.QQQ).toMatchObject({ '5m': 600, '15m': 200, '30m': 100, '4h': 100, '1d': 5000, '1w': 1000 })
  })
  it('구(평면) 형식·빈 객체는 null — 소비처가 기존 동작으로 폴백', () => {
    expect(normalizeCounts({ '5m': 600, '1h': 400 })).toBeNull()
    expect(normalizeCounts({})).toBeNull()
  })
})

describe('avatarSrc', () => {
  const Y = 31_536_000
  it('부 경계 — 배수 0.99/1.6, 신규 유저(배수 1.0)는 보통', () => {
    expect(avatarSrc(989_999, 0)).toBe('/avatar/child_00.png')
    expect(avatarSrc(1_000_000, 0)).toBe('/avatar/child_01.png')
    expect(avatarSrc(1_600_000, 2 * Y)).toBe('/avatar/young_02.png')
  })
  it('나이 경계 — 시뮬 2년/5년, 10억이면 펜트하우스 컷신', () => {
    expect(avatarSrc(1_000_000, 2 * Y - 1)).toBe('/avatar/child_01.png')
    expect(avatarSrc(1_000_000, 5 * Y)).toBe('/avatar/old_01.png')
    expect(avatarSrc(1_000_000_000, 5 * Y)).toBe('/avatar/old_rich.png')
  })
})

describe('SETS', () => {
  it('세트 티커 수 — 빅테크·꿈팔이 6종, 랜덤은 전체(null)', () => {
    expect(SETS.BIGTECH.tickers).toHaveLength(6)
    expect(SETS.GROWTH.tickers).toHaveLength(6)
    expect(SETS.ANY.tickers).toBeNull()
  })
})
