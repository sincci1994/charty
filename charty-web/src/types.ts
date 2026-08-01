export type Timeframe = '5m' | '1h' | '4h'
export type Style = 'SCALP' | 'SWING' | 'LONG'
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
}

export interface Position {
  qty: number
  avgPrice: number
}

export interface Trade {
  ts: number
  side: Side
  price: number
  qty: number
  pnl?: number
}

export interface ActiveSim {
  id: string
  style: Style
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
  style: Style
  symbol: string
  startBalance: number
  endBalance: number
  pnlPct: number
  tradeCount: number
  emotion: string
  memo: string
}
