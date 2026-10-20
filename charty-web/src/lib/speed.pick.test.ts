import { describe, expect, it, vi } from 'vitest'
import type { Candle } from '../types'

// 출제 글루 — 데이터 로더만 가짜로 바꿔 자르기 경계와 종목 거르기를 고정한다
vi.mock('./data', async (orig) => ({ ...(await orig<typeof import('./data')>()), loadTickers: vi.fn(), loadCandleCounts: vi.fn(), loadCandles: vi.fn() }))
import { loadCandleCounts, loadCandles, loadTickers } from './data'
import { SPEED, pickRound } from './speed'

const bars = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ ts: i, o: 1, h: 1, l: 1, c: 1, v: 1 }))

describe('pickRound', () => {
  it('진입 자리가 딱 하나뿐인 짧은 이력도 뽑고, 잘라낸 구간이 과거+판정 캔들로 꽉 찬다', async () => {
    for (const period of [10, 20, 40, 60]) {
      const n = SPEED.lookback + period // 지표가 없어 EMA 워밍업 없이 — 자리 하나
      vi.mocked(loadTickers).mockResolvedValue(['T'])
      vi.mocked(loadCandleCounts).mockResolvedValue({ T: { '1w': n } })
      vi.mocked(loadCandles).mockResolvedValue(bars(n))
      const r = await pickRound({ tf: '1w', tpPct: 5, slPct: null, period })
      expect(r.candles).toHaveLength(SPEED.lookback + period)
      expect(r.candles[SPEED.lookback - 1].ts).toBe(SPEED.lookback - 1) // 진입 캔들
      expect(r.candles.at(-1)!.ts).toBe(n - 1) // 마지막 판정 캔들이 배열 끝
      expect(r.cfg.period).toBe(period)
    }
  })
  it('자리가 없는 종목은 뽑지 않는다', async () => {
    const need = SPEED.lookback + 20
    vi.mocked(loadTickers).mockResolvedValue(['SHORT', 'OK'])
    vi.mocked(loadCandleCounts).mockResolvedValue({ SHORT: { '1d': need - 1 }, OK: { '1d': need } })
    vi.mocked(loadCandles).mockResolvedValue(bars(need))
    for (let i = 0; i < 5; i++) expect((await pickRound({ tf: '1d', tpPct: 5, slPct: null, period: 20 })).symbol).toBe('OK')
  })
})
