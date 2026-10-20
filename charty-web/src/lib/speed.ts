import type { Candle, Timeframe } from '../types'
import { loadCandleCounts, loadCandles, loadTickers } from './data'
import { FEE } from './engine'

// 스피드 게임 — 블라인드 차트 한 장에서 롱/숏만 고르고, 익절·손절선 도달 또는 판정 기간 마감 종가로 즉시 판가름.
// ponytail: 판돈 비율·과거 차트 길이·공개 속도는 아직 고정 — 사용자 설정이 필요해지면 SpeedConfig로 옮긴다
export const SPEED = { lookback: 60, stakePct: 50, revealMs: 80 } as const

// 사용자 설정(기기별 기억) — 시간봉, 이익선·손절선 %(null = 없음), 판정 캔들 수
export interface SpeedConfig { tf: Timeframe; tpPct: number | null; slPct: number | null; period: number }
export const SPEED_DEFAULT: SpeedConfig = { tf: '1d', tpPct: 5, slPct: null, period: 20 } // 1차 고정 규칙 그대로
// 빠른 조합 — 실데이터 무작위 1.2만 판씩 돌려 고른 값 (근거는 Archives/2026-10-20-speed-game.md 2차)
export const SPEED_PRESETS: { label: string; cfg: SpeedConfig }[] = [
  { label: '단타', cfg: { tf: '5m', tpPct: 1, slPct: 0.5, period: 20 } },
  { label: '데이', cfg: { tf: '1h', tpPct: 2, slPct: 1, period: 20 } },
  { label: '스윙', cfg: { tf: '1d', tpPct: 5, slPct: 3, period: 20 } },
  { label: '장기', cfg: { tf: '1w', tpPct: 10, slPct: 5, period: 20 } },
]

export const sameCfg = (a: SpeedConfig, b: SpeedConfig) =>
  a.tf === b.tf && a.tpPct === b.tpPct && a.slPct === b.slPct && a.period === b.period

export type Dir = 'long' | 'short'
// lookback+period개, 진입 = candles[lookback-1]. 판이 자기 규칙을 들고 다녀서 설정을 바꿔도 진행 중인 판은 그대로
export interface SpeedRound { symbol: string; candles: Candle[]; cfg: SpeedConfig }
export interface Outcome { exitIndex: number; exitPrice: number; reason: 'tp' | 'sl' | 'end'; ret: number } // ret = 판돈 ₩1당 순손익 (≥ −1)
export type SpeedPlay = Outcome & { dir: Dir; stake: number; pnl: number; before: number }

// 선 표기 — 고르기 전엔 ±, 고른 뒤엔 가격 방향 부호(롱: 목표 +·손절 −, 숏: 목표 −·손절 +). 없음은 부호 없이
export function linePct(kind: 'tp' | 'sl', pct: number | null, dir?: Dir): string {
  if (pct == null) return '없음'
  if (!dir) return `±${pct}%`
  return `${(kind === 'tp') === (dir === 'long') ? '+' : '−'}${pct}%`
}

// 엔진 왕복과 같은 돈 계산 — 판돈 S = 진입 명목 N×(1+FEE)(engine.ts 매수·숏 잠금), 청산 시 롱 N·r·(1−FEE) / 숏 N·(2−r−FEE·r)
// → 순손익 N·[s(r−1) − FEE(1+r)]. 숏은 r≈2 이상이면 판돈을 넘게 잃으므로 −1에서 자른다(잔고 음수 방지)
export function speedOutcome(candles: Candle[], entry: number, dir: Dir, { period, tpPct, slPct }: Pick<SpeedConfig, 'period' | 'tpPct' | 'slPct'>): Outcome {
  const e = candles[entry].c
  const s = dir === 'long' ? 1 : -1
  const tp = tpPct == null ? null : e * (1 + (s * tpPct) / 100)
  const sl = slPct == null ? null : e * (1 - (s * slPct) / 100)
  const done = (exitIndex: number, exitPrice: number, reason: Outcome['reason']): Outcome => {
    const r = exitPrice / e
    return { exitIndex, exitPrice, reason, ret: Math.max(-1, (s * (r - 1) - FEE * (1 + r)) / (1 + FEE)) }
  }
  // 같은 캔들 안에서는 시가가 먼저 — 시가가 이미 선 너머면 그쪽이 시가에 체결된다.
  // 시가가 두 선 사이인데 한 캔들이 둘 다 건드리면 손절 먼저(순서를 몰라 보수적으로).
  // 손절은 닿으면 체결(역지정가), 익절은 넘어서야 체결(지정가 — 시뮬 엔진의 depth 0 미체결과 같은 판정)
  for (let i = entry + 1; i <= entry + period; i++) {
    const { o, h, l } = candles[i]
    if (tp != null && s * (o - tp) > 0) return done(i, o, 'tp')
    if (sl != null && s * ((s > 0 ? l : h) - sl) <= 0) return done(i, s > 0 ? Math.min(o, sl) : Math.max(o, sl), 'sl')
    if (tp != null && s * ((s > 0 ? h : l) - tp) > 0) return done(i, tp, 'tp')
  }
  return done(entry + period, candles[entry + period].c, 'end')
}

// 종목 고르기 — 진입 가능한 자리 수로 가중해 모든 (종목, 진입) 조합이 거의 같은 확률이 되게 한다.
// 균등하게 고르면 이력이 짧은 종목이 1/N 몫을 진입 한두 개로 채워 같은 차트가 되풀이된다(답을 외우게 됨)
export function pickWeighted(spans: [string, number][], rnd = Math.random): string | null {
  const live = spans.filter(([, k]) => k > 0)
  let r = rnd() * live.reduce((a, [, k]) => a + k, 0)
  for (const [s, k] of live) if ((r -= k) < 0) return s
  return live.at(-1)?.[0] ?? null
}

// 한 판 출제 — 블라인드 구간에서 필요한 만큼만 잘라 반환 (전체 수천 개는 버림).
// 스피드 차트는 지표를 안 그려서 시뮬(pickRange)의 EMA 워밍업 260개를 건너뛸 필요가 없다 → 진입 ∈ [lookback−1, 길이−period−1]
export async function pickRound(cfg: SpeedConfig): Promise<SpeedRound> {
  const [tickers, counts] = await Promise.all([loadTickers(), loadCandleCounts().catch(() => null)])
  const need = SPEED.lookback + cfg.period // 과거(진입 포함) + 판정 캔들
  // counts를 못 읽으면 균등 — 길이가 모자란 종목은 아래 throw가 [다시 시도]로 드러낸다
  const symbol = pickWeighted(tickers.map((t) => [t, counts ? (counts[t]?.[cfg.tf] ?? 0) - need + 1 : 1]))
  if (!symbol) throw new Error('이 설정을 감당할 종목 데이터가 없어요')
  const all = await loadCandles(symbol, cfg.tf)
  const spots = all.length - need + 1
  if (spots <= 0) throw new Error('캔들 데이터가 부족합니다')
  const entry = SPEED.lookback - 1 + Math.floor(Math.random() * spots)
  return { symbol, candles: all.slice(entry - SPEED.lookback + 1, entry + cfg.period + 1), cfg }
}

// 차트 y범위에 넣을 선 가격 — 보이는 과거 캔들이 진입가에서 움직인 폭의 1.5배 안쪽만.
// 더 먼 선(5분봉에 이익선 5% 등)까지 넣으면 캔들이 한 줄로 눌린다 → SpeedChart가 가장자리에 화살표로 붙인다.
// 진입가·과거 캔들·설정에만 의존해 미래는 안 새고, 판마다 고정이라 탭할 때 스케일이 다시 잡히지 않는다
export function nearPrices(past: Candle[], entry: number, prices: number[]): number[] {
  const half = Math.max(...past.map((c) => Math.max(c.h - entry, entry - c.l)))
  return prices.filter((p) => Math.abs(p - entry) <= half * 1.5)
}
