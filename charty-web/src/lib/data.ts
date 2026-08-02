import type { Candle, CustomStyle, Style, Timeframe, Unit } from '../types'

export const STYLES: Record<Style, { label: string; period: string; interval: string; tf: Timeframe; bars: number }> = {
  SCALP: { label: '단타', period: '1일', interval: '5분', tf: '5m', bars: 78 },
  SWING: { label: '스윙', period: '14일', interval: '1시간', tf: '1h', bars: 98 },
  LONG: { label: '장기투자', period: '60일', interval: '4시간', tf: '4h', bars: 120 },
}

export const TF_LABELS: Record<Timeframe, string> = { '5m': '5분', '1h': '1시간', '4h': '4시간' }

// 미국장 6.5h(390분) 기준 거래일 환산
const DAYS_PER_UNIT: Record<Unit, number> = { 분: 1 / 390, 시간: 60 / 390, 일: 1, 주: 5, 개월: 21, 년: 252 }
const BARS_PER_DAY: Record<Timeframe, number> = { '5m': 78, '1h': 7, '4h': 2 }

// ponytail: 실측 캔들 수(5m 4680 / 1h 5072 / 4h 1704) − pickRange 최소 여유 260 — 데이터 재수집 시 갱신
export const MAX_BARS: Record<Timeframe, number> = { '5m': 4420, '1h': 4800, '4h': 1440 }
export const MIN_BARS = 10

export function barsFor(c: CustomStyle): number {
  return Math.max(1, Math.round(c.periodValue * DAYS_PER_UNIT[c.periodUnit] * BARS_PER_DAY[c.tf]))
}

const SEC_PER_CANDLE = 2 // ponytail: 예상 소요시간용 임시 가정치 — 실사용 데이터 쌓이면 조정

export function estTime(bars: number): string {
  const m = Math.max(1, Math.round((bars * SEC_PER_CANDLE) / 60))
  return m >= 60 ? `약 ${Math.round((m / 60) * 10) / 10}시간` : `약 ${m}분`
}

// 1000 미만(달러대 종목)은 소수 2자리 유지, 이상은 정수
export const fmtW = (v: number) =>
  `₩${v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 1000 ? 2 : 0 })}`

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

// 볼린저밴드 (SMA±k·σ) — 앞쪽 period-1개는 null
export function bollinger(closes: number[], period = 20, k = 2): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const w = closes.slice(i - period + 1, i + 1)
    const m = w.reduce((a, b) => a + b, 0) / period
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / period)
    upper.push(m + k * sd)
    lower.push(m - k * sd)
  }
  return { upper, lower }
}

// RSI (Wilder smoothing) — 앞쪽 period개는 null
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = []
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      out.push(null)
      continue
    }
    const diff = closes[i] - closes[i - 1]
    const gain = Math.max(diff, 0)
    const loss = Math.max(-diff, 0)
    if (i < period) {
      avgGain += gain
      avgLoss += loss
      out.push(null)
    } else if (i === period) {
      avgGain = (avgGain + gain) / period
      avgLoss = (avgLoss + loss) / period
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
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
