import type { Candle, CustomStyle, EconIndicator, FundQuarter, NewsData, Style, Timeframe, Unit } from '../types'

export const START_BALANCE = 10_000_000 // 초기 총 자산 1천만원 (2026-08-15 100만→1천만)

export const STYLES: Record<Style, { label: string; period: string; tf: Timeframe; bars: number }> = {
  SCALP: { label: '단타', period: '1일', tf: '5m', bars: 78 },
  SWING: { label: '스윙', period: '14일', tf: '1h', bars: 98 },
  LONG: { label: '장기투자', period: '60일', tf: '4h', bars: 120 },
}

// 프리셋 키면 프리셋 라벨, 아니면 시작 시점 스냅샷 라벨(커스텀)
export const styleLabel = (style: string, snap?: string) => STYLES[style as Style]?.label ?? snap ?? '커스텀'

export const TF: Record<Timeframe, { label: string; sec: number }> = {
  '5m': { label: '5분', sec: 300 }, '15m': { label: '15분', sec: 900 }, '30m': { label: '30분', sec: 1800 },
  '1h': { label: '1시간', sec: 3600 }, '4h': { label: '4시간', sec: 14400 }, '1d': { label: '1일', sec: 86400 }, '1w': { label: '1주', sec: 604800 },
}

// 버킷 시작(floor(ts/tfSec)) 기준 OHLCV 집계 — src는 ts 오름차순 가정, 마지막 버킷은 부분 캔들일 수 있음
export function resampleCandles(src: Candle[], tfSec: number): Candle[] {
  const out: Candle[] = []
  for (const c of src) {
    const ts = Math.floor(c.ts / tfSec) * tfSec
    const last = out[out.length - 1]
    if (last && last.ts === ts) {
      last.h = Math.max(last.h, c.h)
      last.l = Math.min(last.l, c.l)
      last.c = c.c
      last.v += c.v
    } else {
      out.push({ ts, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })
    }
  }
  return out
}

// 미국장 6.5h(390분) 기준 거래일 환산
const DAYS_PER_UNIT: Record<Unit, number> = { 분: 1 / 390, 시간: 60 / 390, 일: 1, 주: 5, 개월: 21, 년: 252 }
const BARS_PER_DAY: Record<Timeframe, number> = { '5m': 78, '15m': 26, '30m': 13, '1h': 7, '4h': 2, '1d': 1, '1w': 0.2 }

export const EMA_WARMUP = 200 // EMA200이 유효해지는 데 필요한 앞쪽 캔들 수
export const LOOKBACK = 60 // 시작 시 차트에 미리 보여줄 과거 캔들 수

// 실측 캔들 수(candle-counts.json — fetch-data.py가 생성): R13부터 종목별 {SYM: {tf: n}} 형식.
// 15m/30m/4h은 파일 없이 기본 TF에서 리샘플하므로 개수도 나눗셈으로 파생 (floor라 약간 보수적).
// 구(평면 {tf: n}) 형식이면 null — 종목별 정보가 없으므로 소비처가 기존 동작으로 폴백
// (앱 배포가 파이프라인 실행보다 앞서는 창 커버)
export type SymbolCounts = Record<string, Partial<Record<Timeframe, number>>>
export function normalizeCounts(raw: Record<string, unknown>): SymbolCounts | null {
  if (Object.keys(raw).length === 0 || typeof Object.values(raw)[0] === 'number') return null
  return Object.fromEntries(Object.entries(raw as SymbolCounts).map(([sym, c]) => [sym, {
    ...c, '15m': Math.floor((c['5m'] ?? 0) / 3), '30m': Math.floor((c['5m'] ?? 0) / 6), '4h': Math.floor((c['1h'] ?? 0) / 4),
  }]))
}

// 파이프라인이 매일 갱신하므로 빌드타임 import 대신 런타임 fetch (모듈 캐시로 1회만)
let countsRaw: Record<string, unknown> | null = null
async function loadCountsRaw(): Promise<Record<string, unknown>> {
  if (countsRaw) return countsRaw
  const res = await fetch(base + 'candle-counts.json')
  // Supabase 404는 JSON 에러 바디라 json()이 성공해버림 — 오염 캐시 방지 (실패 시 소비처가 폴백)
  if (!res.ok) throw new Error(`candle-counts fetch failed: ${res.status}`)
  countsRaw = await res.json()
  return countsRaw!
}

// 종목별 캔들 수 — startSim의 종목 적합 필터용. null = 구형식(필터 생략)
export async function loadCandleCounts(): Promise<SymbolCounts | null> {
  return normalizeCounts(await loadCountsRaw())
}

export async function loadMaxBars(): Promise<Record<Timeframe, number>> {
  const raw = await loadCountsRaw()
  const per = normalizeCounts(raw)
  // 종목별 형식: TF별 종목 간 최대값 — 커스텀 상한은 최장 이력 종목 기준, 못 미치는 종목은
  // startSim 적합 필터가 거른다 (짧은 신규 종목 하나가 전체 상한을 깎던 문제 제거).
  // 구(평면) 형식: 전 종목 최소값 그대로 (기존 동작)
  const full = per
    ? Object.fromEntries((Object.keys(TF) as Timeframe[]).map((tf) => [tf, Math.max(0, ...Object.values(per).map((c) => c[tf] ?? 0))]))
    : { ...(raw as Record<string, number>), '15m': Math.floor((raw['5m'] as number) / 3), '30m': Math.floor((raw['5m'] as number) / 6), '4h': Math.floor((raw['1h'] as number) / 4) }
  return Object.fromEntries(
    Object.entries(full).map(([tf, n]) => [tf, n - EMA_WARMUP - LOOKBACK]),
  ) as Record<Timeframe, number>
}
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

// 가격 표기($) — 가격은 캔들 원값($), 돈은 ₩라는 단위 규약(engine.ts)의 표시 짝
export const fmtD = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 1000 ? 2 : 0 })}`

// R14 종목 세트 — tickers: null = 전체 (유니버스 원본은 tickers.json, 여기서 중복 정의하지 않음)
export const SETS: Record<string, { label: string; vol: string | null; desc: string; tickers: readonly string[] | null }> = {
  BIGTECH: { label: '빅테크', vol: '중간', desc: '시가총액 상위 대형 기술주·지수 ETF. 흐름이 비교적 안정적이에요', tickers: ['QQQ', 'SPY', 'AAPL', 'NVDA', 'TSLA', 'MSFT'] },
  SEMI: { label: '반도체·AI', vol: '중간', desc: 'AI·메모리·파운드리 대표주. 업황 사이클을 크게 타요', tickers: ['AMD', 'INTC', 'MU', 'TSM', 'AVGO', 'QCOM'] },
  SP500: { label: 'S&P500 우량주', vol: '낮음', desc: '금융·헬스케어·에너지 등 섹터 대표 우량주. 느리지만 꾸준해요', tickers: ['JPM', 'JNJ', 'KO', 'XOM', 'CAT', 'DIS'] },
  RUSSELL: { label: '러셀 스몰캡', vol: '높음', desc: '이름도 낯선 미국 중소형주. 급등도 급락도 크고 거래대금이 얇아요', tickers: ['CROX', 'GPRO', 'FSLR', 'KTOS', 'SFIX'] },
  GROWTH: { label: '꿈팔이 성장주', vol: '높음', desc: '미래 서사와 기대감으로 움직이는 성장주', tickers: ['PLUG', 'FCEL', 'LCID', 'RIVN', 'JOBY', 'IONQ'] },
  ANY: { label: '랜덤 · 상관없음', vol: null, desc: '어떤 종목이 나올지 모르는 채로 연습해요', tickers: null },
}
export type SetKey = keyof typeof SETS

// R14 홈 아바타 — 나이=프로필 연령대 시작 나이+시뮬 경과(30/60 경계), 부=원금 대비 배수(0.99/1.6), 10억 = '한국 부자' 펜트하우스 컷신
// 성별 세트는 파일명 프리픽스(m_/f_) — 에셋이 아직 없으면 호출부 <img onError>가 공용 세트로 폴백
const YEAR = 31_536_000
const BAND_AGE: Record<string, number> = { '10대': 15, '20대': 25, '30대': 35, '40대': 45, '50대': 55, '60대+': 65 }
const GENDER_PREFIX: Record<string, string> = { 남성: 'm_', 여성: 'f_' }
export function avatarSrc(totalAsset: number, simSec: number, ageBand?: string | null, gender?: string | null): string {
  const years = (BAND_AGE[ageBand ?? ''] ?? 25) + simSec / YEAR // 미설정·비로그인은 20대 취급
  const age = years < 30 ? 'child' : years < 60 ? 'young' : 'old'
  const m = totalAsset / START_BALANCE
  const wealth = totalAsset >= 1_000_000_000 ? 'rich' : m < 0.99 ? '00' : m < 1.6 ? '01' : '02'
  return `/avatar/${GENDER_PREFIX[gender ?? ''] ?? ''}${age}_${wealth}.png`
}

// 차트 경과시간(달력 기준, 초) 사람 표기 — "약 1년 3개월"·"약 3개월 12일"·"약 5일"·"약 6시간" (0 나머지 생략)
export function fmtDur(sec: number): string {
  const d = Math.floor(sec / 86400)
  if (d >= 365) { const y = Math.floor(d / 365); const m = Math.floor((d % 365) / 30); return `약 ${y}년${m ? ` ${m}개월` : ''}` }
  if (d >= 30) { const m = Math.floor(d / 30); const r = d % 30; return `약 ${m}개월${r ? ` ${r}일` : ''}` }
  if (d >= 1) return `약 ${d}일`
  return `약 ${Math.max(1, Math.round(sec / 3600))}시간`
}

// Supabase Storage CDN 등 외부 데이터 소스 — 미설정 시 로컬 public/data 폴백 (dev·테스트)
// replace: 끝 슬래시 유무 무관하게 동작 (Vercel 환경변수 오타 방지)
const base = (process.env.NEXT_PUBLIC_DATA_URL ?? '/data').replace(/\/?$/, '/')

export async function loadTickers(): Promise<string[]> {
  const res = await fetch(base + 'tickers.json')
  return res.json()
}

// 15m/30m/4h은 파일이 없음 — 기본 TF를 받아 리샘플 (기존 정적 파일도 같은 리샘플로 생성됐었음)
const BASE_TF: Partial<Record<Timeframe, Timeframe>> = { '15m': '5m', '30m': '5m', '4h': '1h' }

export async function loadCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const src = BASE_TF[tf]
  const res = await fetch(`${base}${symbol}_${src ?? tf}.json`)
  const rows: number[][] = await res.json()
  const candles = rows.map(([ts, o, h, l, c, v]) => ({ ts, o, h, l, c, v }))
  return src ? resampleCandles(candles, TF[tf].sec) : candles
}

export async function loadEcon(): Promise<EconIndicator[]> {
  const res = await fetch(base + 'econ.json')
  return res.json()
}

// R10 분기 재무 (개별주 4종만 — ETF는 키 없음)
export async function loadFundamentals(): Promise<Record<string, FundQuarter[]>> {
  const res = await fetch(base + 'fundamentals.json')
  if (!res.ok) throw new Error(`fundamentals fetch failed: ${res.status}`) // Supabase 404는 JSON 에러 바디 — 캐시 오염 방지
  const raw: Record<string, [number, number, number | null, number | null, number | null][]> = await res.json()
  return Object.fromEntries(
    Object.entries(raw).map(([s, rows]) => [s, rows.map(([filedTs, endTs, rev, opInc, eps]) => ({ filedTs, endTs, rev, opInc, eps }))]),
  )
}

export async function loadNews(): Promise<NewsData> {
  const res = await fetch(base + 'news.json')
  return res.json()
}

export type Headline = [ts: number, title: string, source: string]

// 시뮬 시점 매칭용 과거 헤드라인 (news-archive.json — GDELT, 2017년~)
export async function loadNewsArchive(): Promise<Headline[]> {
  const res = await fetch(base + 'news-archive.json')
  return res.json()
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
