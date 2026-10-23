import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SETS, START_BALANCE, WEALTH_TIERS, avatarSrc, fmtDur, normalizeCounts, resampleCandles, tierOf, tierProgress } from './data'
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

describe('WEALTH_TIERS · tierOf', () => {
  it('표 불변식 — 10단계, 하한 0부터 오름차순 (findLastIndex가 정렬에 기댄다)', () => {
    expect(WEALTH_TIERS).toHaveLength(10)
    expect(WEALTH_TIERS[0].min).toBe(0)
    WEALTH_TIERS.slice(1).forEach((t, i) => expect(t.min).toBeGreaterThan(WEALTH_TIERS[i].min))
  })
  it('하한 이상이면 그 단계 — 음수·0은 거지, 10억 이상은 펜트하우스, 시작 자산은 개미', () => {
    const cases: [number, number][] = [
      [-1, 0], [0, 0], [2_999_999, 0], [3_000_000, 1], [7_999_999, 1], [8_000_000, 2],
      [START_BALANCE, 2], [13_000_000, 3], [20_000_000, 4], [999_999_999, 8], [1e9, 9], [1e13, 9],
    ]
    for (const [asset, i] of cases) expect(tierOf(asset), String(asset)).toBe(i)
    expect(WEALTH_TIERS[tierOf(START_BALANCE)].label).toBe('개미')
  })
})

describe('tierProgress — 게이지', () => {
  it('단계 안 선형 진행률과 다음 단계 — 시작 자산은 개미(800만~1,300만)의 40%', () => {
    const g = tierProgress(START_BALANCE)
    expect([g.i, g.cur.label, g.next?.label]).toEqual([2, '개미', '목돈'])
    expect(g.pct).toBeCloseTo(0.4, 10)
    expect(g.next!.min - START_BALANCE).toBe(3_000_000)
  })
  it('하한 0인 거지 단계도 계산되고, 음수는 0에서 멈춘다', () => {
    expect(tierProgress(1_500_000).pct).toBeCloseTo(0.5, 10)
    expect(tierProgress(-5).pct).toBe(0)
  })
  it('최고 단계는 다음이 없고 가득 찬다', () => {
    const g = tierProgress(1e9)
    expect([g.i, g.next, g.pct]).toEqual([9, undefined, 1])
  })
})

describe('avatarSrc', () => {
  const Y = 31_536_000
  it('부 경계 — 단계마다 제 그림 (사다리 하한마다 바뀜)', () => {
    const cases: [number, string][] = [
      [2_999_999, 'beggar'], [3_000_000, '00'], [7_999_999, '00'], [8_000_000, '01'], [10_000_000, '01'], [13_000_000, '02'],
      [20_000_000, 'car'], [40_000_000, 'luxury'], [80_000_000, 'boss'], [150_000_000, 'supercar'],
      [300_000_000, 'landlord'], [999_999_999, 'landlord'], [1_000_000_000, 'rich'],
    ]
    for (const [asset, key] of cases) expect(avatarSrc(asset, 0), String(asset)).toBe(`/avatar/child_${key}.png`)
  })
  it('모든 단계 × 나이의 그림이 public/avatar에 있다 — 런타임 존재 검사가 없어 하나라도 빠지면 깨진 이미지', () => {
    for (const { img } of WEALTH_TIERS)
      for (const age of ['child', 'young', 'old'])
        expect(existsSync(new URL(`../../public/avatar/${age}_${img}.png`, import.meta.url)), `${age}_${img}`).toBe(true)
  })
  it('나이 = 연령대 시작 나이 + 시뮬 경과, 경계 30/60', () => {
    expect(avatarSrc(10_000_000, 0, '30대')).toBe('/avatar/young_01.png') // 33세 유저는 어른부터 시작
    expect(avatarSrc(10_000_000, 0, '60대+')).toBe('/avatar/old_01.png')
    expect(avatarSrc(10_000_000, 5 * Y - 1)).toBe('/avatar/child_01.png') // 기본 25세 + 5년 미만 = 학생
    expect(avatarSrc(10_000_000, 5 * Y)).toBe('/avatar/young_01.png')
    expect(avatarSrc(10_000_000, 35 * Y, '20대')).toBe('/avatar/old_01.png') // 25 + 35 = 60
    expect(avatarSrc(1_000_000_000, 0, '60대+')).toBe('/avatar/old_rich.png')
  })
  it('성별 프리픽스 — 미설정은 공용 세트', () => {
    expect(avatarSrc(10_000_000, 0, '30대', '여성')).toBe('/avatar/f_young_01.png')
    expect(avatarSrc(10_000_000, 0, '30대', '남성')).toBe('/avatar/m_young_01.png')
    expect(avatarSrc(10_000_000, 0, null, null)).toBe('/avatar/child_01.png')
  })
})

describe('SETS', () => {
  it('세트 티커 수 — 러셀은 5종(IRBT 상폐 제거), 나머지 6종, 랜덤은 전체(null), 세트 간 중복 없음', () => {
    const keyed = ['BIGTECH', 'SEMI', 'SP500', 'RUSSELL', 'GROWTH']
    for (const k of keyed) expect(SETS[k].tickers).toHaveLength(k === 'RUSSELL' ? 5 : 6)
    expect(SETS.ANY.tickers).toBeNull()
    const all = keyed.flatMap((k) => SETS[k].tickers!)
    expect(new Set(all).size).toBe(all.length) // 중복 없음 (총 수는 세트 구성에 따름)
  })
})
