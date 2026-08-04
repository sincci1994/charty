export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

export interface EconIndicator {
  id: string
  label: string
  unit: string
  data: [number, number][] // [발표일 근사 ts, 값] 오름차순
}

export interface NewsItem {
  title: string
  source: string
  link: string
  ts: number
}
export interface NewsData {
  fetchedAt: number
  kr: NewsItem[]
  us: NewsItem[]
}
export type Style = 'SCALP' | 'SWING' | 'LONG'
export type Unit = '분' | '시간' | '일' | '주' | '개월' | '년' // 리터럴이 곧 표시 문자열

export interface CustomStyle {
  id: string
  name: string
  periodValue: number
  periodUnit: Unit
  tf: Timeframe
}
export type Side = 'OPEN_LONG' | 'CLOSE_LONG' | 'OPEN_SHORT' | 'CLOSE_SHORT'

export interface Candle {
  ts: number // unix seconds
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface Order {
  id: string
  side: Side
  price: number
  qty: number
  reasons?: string[] // 매매 이유 (선택)
}

export interface Position {
  qty: number
  avgPrice: number
  entries?: { qty: number; price: number }[] // 진입 이력 (append-only) — optional: 구버전 persist 호환
}

export interface Trade {
  ts: number
  side: Side
  price: number
  qty: number
  pnl?: number
  reasons?: string[]
}

export interface ActiveSim {
  id: string
  style: string // 프리셋 키(Style) 또는 커스텀 스타일 id
  styleLabel?: string // 시작 시점 라벨 스냅샷 — 커스텀 삭제 후에도 표시 유지
  symbol: string
  timeframe: Timeframe
  startIndex: number
  endIndex: number
  cursor: number // 현재 보이는 마지막 캔들 인덱스
  startBalance: number
  cash: number
  positions: { LONG?: Position; SHORT?: Position }
  openOrders: Order[]
  trades: Trade[]
  done: boolean
}

export interface SimRecord {
  id: string
  endedAt: number
  style: string
  styleLabel?: string
  symbol: string
  startBalance: number
  endBalance: number
  pnlPct: number
  tradeCount: number
  emotion: string
  memo: string
}
