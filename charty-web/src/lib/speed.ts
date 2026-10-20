import type { Candle } from '../types'
import { EMA_WARMUP, LOOKBACK, loadCandleCounts, loadCandles, loadTickers, pickRange } from './data'
import { FEE } from './engine'

// 스피드 게임 — 블라인드 차트 한 장에서 롱/숏만 고르고, 익절(TP) 도달 또는 기간 마감 종가로 즉시 판가름.
// ponytail: 규칙 전부 임시 고정값 — 손절·기간·매매기법 프리셋을 유저 설정으로 열 때 이 객체를 store 상태로 승격
export const SPEED = { tf: '1d', lookback: 60, period: 20, tpPct: 5, stakePct: 50, revealMs: 80 } as const

export type Dir = 'long' | 'short'
export interface SpeedRound { symbol: string; candles: Candle[] } // lookback+period개, 진입 = candles[lookback-1]
export interface Outcome { exitIndex: number; exitPrice: number; hitTp: boolean; ret: number } // ret = 판돈 ₩1당 순손익 (≥ −1)
export type SpeedPlay = Outcome & { dir: Dir; stake: number; pnl: number; before: number }

// 엔진 왕복과 같은 돈 계산 — 판돈 S = 진입 명목 N×(1+FEE)(engine.ts 매수·숏 잠금), 청산 시 롱 N·r·(1−FEE) / 숏 N·(2−r−FEE·r)
// → 순손익 N·[s(r−1) − FEE(1+r)]. 숏은 r≈2 이상이면 판돈을 넘게 잃으므로 −1에서 자른다(잔고 음수 방지)
export function speedOutcome(candles: Candle[], entry: number, dir: Dir, { period, tpPct }: { period: number; tpPct: number } = SPEED): Outcome {
  const e = candles[entry].c
  const s = dir === 'long' ? 1 : -1
  const tp = e * (1 + (s * tpPct) / 100)
  const done = (exitIndex: number, exitPrice: number, hitTp: boolean): Outcome => {
    const r = exitPrice / e
    return { exitIndex, exitPrice, hitTp, ret: Math.max(-1, (s * (r - 1) - FEE * (1 + r)) / (1 + FEE)) }
  }
  for (let i = entry + 1; i <= entry + period; i++) {
    const { o, h, l } = candles[i]
    // TP는 '넘어서야' 도달 — 정확히 닿기만 하면 미도달(시뮬 엔진의 depth 0 미체결과 같은 판정). 갭이면 시가 청산
    if (s > 0 ? h > tp : l < tp) return done(i, s > 0 ? Math.max(o, tp) : Math.min(o, tp), true)
  }
  return done(entry + period, candles[entry + period].c, false)
}

// 한 판 출제 — 시뮬과 같은 블라인드 구간 선택(pickRange)에서 필요한 80개만 잘라 반환 (전체 ~5천 개는 버림)
export async function pickRound(): Promise<SpeedRound> {
  const [tickers, counts] = await Promise.all([loadTickers(), loadCandleCounts().catch(() => null)])
  const need = EMA_WARMUP + LOOKBACK + SPEED.period + 1 // pickRange(len, period+1)이 성립하는 최소 길이
  const pool = counts ? tickers.filter((t) => (counts[t]?.[SPEED.tf] ?? 0) >= need) : tickers
  const symbol = pool[Math.floor(Math.random() * pool.length)]
  const all = await loadCandles(symbol, SPEED.tf)
  const { startIndex: entry } = pickRange(all.length, SPEED.period + 1)
  return { symbol, candles: all.slice(entry - SPEED.lookback + 1, entry + SPEED.period + 1) }
}
