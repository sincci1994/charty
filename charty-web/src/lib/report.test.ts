import { describe, expect, it } from 'vitest'
import type { SimEvent, SimRecord, Trade } from '../types'
import { cumulativeReport, cumulativeSimTime, episodes, newsFollowups, postLossRatios, sessionObservations, slExecution } from './report'

const H = 3600 // 1h 타임프레임 초
const buy = (ts: number, price: number, qty: number, extra: Partial<Trade> = {}): Trade => ({ ts, side: 'OPEN_LONG', price, qty, reasons: ['기술적'], ...extra })
const sell = (ts: number, price: number, qty: number, pnl: number): Trade => ({ ts, side: 'CLOSE_LONG', price, qty, pnl, reasons: ['감정·직관'] })

describe('episodes', () => {
  it('첫 매수→전량 청산이 한 에피소드, 부분 청산 손익은 합산', () => {
    const eps = episodes([buy(0, 100, 10), sell(H, 110, 5, 50), sell(2 * H, 90, 5, -50)])
    expect(eps).toHaveLength(1)
    expect(eps[0]).toMatchObject({ startTs: 0, endTs: 2 * H, pnl: 0 })
  })
  it('미청산 포지션은 제외', () => {
    expect(episodes([buy(0, 100, 10), sell(H, 110, 4, 40)])).toHaveLength(0)
  })
})

describe('postLossRatios', () => {
  it('손실 매도 직후 첫 매수 / 평소(손실 직후가 아닌) 매수 평균 비율', () => {
    // 평소 매수 = 1000 (첫 매수), 손실 후 매수 = 2000 → 2.0 (자기 포함 희석 없음)
    const r = postLossRatios([buy(0, 100, 10), sell(H, 90, 10, -100), buy(2 * H, 100, 20)])
    expect(r).toHaveLength(1)
    expect(r[0]).toBeCloseTo(2)
  })
  it('매수 1회뿐이면 비교 기준이 없어 빈 배열', () => {
    expect(postLossRatios([buy(0, 100, 10), sell(H, 90, 10, -100)])).toHaveLength(0)
  })
})

describe('newsFollowups', () => {
  it('뉴스 다음 행동이 cancel/sl/tp면 변경, order면 유지', () => {
    const ev: SimEvent[] = [
      { ts: 0, k: 'news' },
      { ts: H, k: 'cancel' },
      { ts: 2 * H, k: 'news' },
      { ts: 3 * H, k: 'order' },
      { ts: 4 * H, k: 'news' }, // 이후 행동 없음
    ]
    expect(newsFollowups(ev)).toEqual({ views: 3, changes: 1, cancels: 1, riskEdits: 0 })
  })
  it('뉴스 다음의 재무 열람(fund)은 건너뛰고 그 다음 행동으로 판단', () => {
    const ev: SimEvent[] = [
      { ts: 0, k: 'news' },
      { ts: H, k: 'fund' },
      { ts: 2 * H, k: 'sl', v: 90 }, // fund를 건너뛰고 변경으로 집계
      { ts: 3 * H, k: 'news' },
      { ts: 4 * H, k: 'fund' }, // 이후 행동 없음 = 유지
    ]
    expect(newsFollowups(ev)).toEqual({ views: 2, changes: 1, cancels: 0, riskEdits: 1 })
  })
})

describe('slExecution', () => {
  it('도달 후 3캔들 내 매도만 실행으로 집계', () => {
    const ev: SimEvent[] = [{ ts: 0, k: 'slhit' }, { ts: 100 * H, k: 'slhit' }]
    const trades = [sell(2 * H, 95, 5, -25)] // 첫 도달만 3캔들 내
    expect(slExecution(trades, ev, H)).toEqual({ hits: 2, executed: 1 })
  })
  it('강제 청산·같은 캔들 체결·중복 매칭은 실행이 아니다', () => {
    const ev: SimEvent[] = [{ ts: 0, k: 'slhit' }, { ts: H, k: 'slhit' }]
    const forced = { ...sell(2 * H, 95, 5, -25), forced: true }
    const sameCandle = sell(0, 95, 5, -25) // 도달과 같은 캔들 = 기존 지정매도, 반응 아님
    expect(slExecution([forced, sameCandle], ev, H)).toEqual({ hits: 2, executed: 0 })
    // 매도 1건은 도달 1건에만 매칭 — 도달 2회·매도 1회 = 실행 1회
    expect(slExecution([sell(2 * H, 95, 5, -25)], ev, H)).toEqual({ hits: 2, executed: 1 })
  })
})

describe('sessionObservations', () => {
  it('수익·손실 에피소드가 있으면 보유시간 관찰을 만든다', () => {
    const trades = [
      buy(0, 100, 10), sell(2 * H, 110, 10, 100), // 수익 2캔들
      buy(3 * H, 100, 10), sell(9 * H, 90, 10, -100), // 손실 6캔들
    ]
    const obs = sessionObservations(trades, [], H)
    const hold = obs.find((o) => o.text.includes('보유했습니다'))
    expect(hold?.text).toContain('평균 2캔들')
    expect(hold?.text).toContain('평균 6캔들')
  })
  it('관찰 불가 세션(거래 없음)은 빈 배열', () => {
    expect(sessionObservations([], [], H)).toHaveLength(0)
  })
})

describe('cumulativeReport', () => {
  const rec = (id: string, trades: Trade[], events: SimEvent[] = []): SimRecord => ({
    id, endedAt: 0, style: 'SWING', timeframe: '1h', symbol: 'QQQ',
    startBalance: 1e6, endBalance: 1e6, pnlPct: 0, tradeCount: trades.length,
    emotion: '😐', memo: '', trades, events,
  })

  it('판단 기록 없는 구버전 세션은 legacy로 분류', () => {
    const legacyRec = rec('a', [{ ts: 0, side: 'OPEN_LONG', price: 100, qty: 1 }])
    const r = cumulativeReport([legacyRec, rec('b', [buy(0, 100, 1)])])
    expect(r.judged).toBe(1)
    expect(r.legacy).toBe(1)
  })

  it('임계 미달 지표는 잠금 + 진행률', () => {
    const r = cumulativeReport([rec('a', [buy(0, 100, 1, { sl: 95 })])])
    const m1 = r.metrics.find((m) => m.title === '손절 계획 실행률')!
    expect(m1.locked).toBe(true)
    expect(m1.lockText).toContain('현재 1회')
    expect(m1.lockPct).toBe(10)
  })

  it('뉴스 열람 5회부터 변경률 계산', () => {
    const ev: SimEvent[] = Array.from({ length: 5 }, (_, i) => ({ ts: i * 2 * H, k: 'news' as const }))
    ev.push({ ts: 99 * H, k: 'cancel' }) // 마지막 뉴스만 변경으로 이어짐
    const r = cumulativeReport([rec('a', [buy(0, 100, 1)], ev)])
    const m4 = r.metrics.find((m) => m.title === '뉴스 후 판단 변경률')!
    expect(m4.locked).toBe(false)
    expect(m4.value).toBe('20%')
  })
})

describe('cumulativeSimTime', () => {
  const D = 86400
  const rec = (extra: Partial<SimRecord>): SimRecord =>
    ({ id: 'x', endedAt: 0, style: 'SWING', symbol: 'QQQ', startBalance: 1e6, endBalance: 1e6, pnlPct: 0, tradeCount: 0, emotion: '😐', memo: '', ...extra })

  it('startTs·endTs 있는 기록만 합산, 없는 R13 이전 기록은 excluded', () => {
    const { sec, excluded } = cumulativeSimTime([
      rec({ startTs: 0, endTs: 3 * D }),
      rec({ startTs: 10 * D, endTs: 12 * D, early: true }), // 조기 종료 — endTs가 이미 플레이한 구간까지만
      rec({}),
    ])
    expect(sec).toBe(5 * D)
    expect(excluded).toBe(1)
  })

  it('빈 기록이면 0', () => {
    expect(cumulativeSimTime([])).toEqual({ sec: 0, excluded: 0 })
  })
})
