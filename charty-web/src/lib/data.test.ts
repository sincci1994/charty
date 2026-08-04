import { describe, expect, it } from 'vitest'
import { resampleCandles } from './data'
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
