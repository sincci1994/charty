import type { Candle, Style, Timeframe } from '../types'

export const STYLES: Record<Style, { label: string; desc: string; tf: Timeframe; bars: number }> = {
  SCALP: { label: '단타', desc: '1일 · 5분봉', tf: '5m', bars: 78 },
  SWING: { label: '스윙', desc: '14일 · 1시간봉', tf: '1h', bars: 98 },
  LONG: { label: '장기', desc: '60일 · 4시간봉', tf: '4h', bars: 120 },
}

export const EMA_WARMUP = 200 // EMA200이 유효해지는 데 필요한 앞쪽 캔들 수
export const LOOKBACK = 60 // 시작 시 차트에 미리 보여줄 과거 캔들 수

const base = import.meta.env.BASE_URL + 'data/'

export async function loadTickers(): Promise<string[]> {
  const res = await fetch(base + 'tickers.json')
  return res.json()
}

export async function loadCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const res = await fetch(`${base}${symbol}_${tf}.json`)
  const rows: number[][] = await res.json()
  return rows.map(([ts, o, h, l, c, v]) => ({ ts, o, h, l, c, v }))
}

export function ema(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const out: (number | null)[] = []
  let prev: number | null = null
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      out.push(null)
    } else if (prev === null) {
      // 첫 값은 SMA로 시딩
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += closes[j]
      prev = sum / period
      out.push(prev)
    } else {
      prev = closes[i] * k + prev * (1 - k)
      out.push(prev)
    }
  }
  return out
}

// 워밍업/룩백을 확보한 랜덤 시뮬 구간 선택
export function pickRange(total: number, bars: number): { startIndex: number; endIndex: number } {
  const min = EMA_WARMUP + LOOKBACK
  const max = total - bars
  if (max < min) throw new Error('캔들 데이터가 부족합니다')
  const startIndex = min + Math.floor(Math.random() * (max - min + 1))
  return { startIndex, endIndex: startIndex + bars - 1 }
}
