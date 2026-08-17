export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

export interface EconIndicator {
  id: string
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

// R5 매매 이유 — 수익화방향 5장의 5범주를 범주 레벨로 축약
export const REASONS = ['기술적', '기업·실적', '거시경제', '뉴스·분위기', '감정·직관'] as const

export interface Order {
  id: string
  side: Side
  price: number
  qty: number
  reasons?: string[] // R5 판단 기록 — optional: 구버전 persist 호환
  sl?: number // 손절 계획가 (기록만, 자동 체결 없음)
  tp?: number // 목표 계획가
}

export interface Position {
  qty: number
  avgPrice: number
  entries?: { qty: number; price: number }[] // 진입 이력 (append-only) — optional: 구버전 persist 호환
  sl?: number // 손절 계획가 — 체결·수정으로 갱신
  tp?: number
  slHit?: boolean // 현재 sl 값에 대해 도달 이벤트를 이미 기록했는가 (sl 수정 시 리셋)
}

export interface Trade {
  ts: number
  side: Side
  price: number
  qty: number
  pnl?: number
  reasons?: string[] // 주문의 판단 기록이 체결에 실려 보존됨
  sl?: number
  tp?: number
  forced?: boolean // 세션 종료 강제 매도 — 사용자 행동이 아니므로 리포트의 '계획 실행' 집계에서 제외
}

// R6 행동 이벤트 — 원시 기록만, 해석은 리포트(R7)에서
// ts는 시뮬 시간(캔들 ts). k: news=뉴스 탭 열람, fund=재무 탭 열람(R10), cancel=주문 취소,
// order=주문 제출(ms=시트 열림→제출 소요), sl/tp=리스크 수정(old→v), slhit=손절 계획가 도달
export interface SimEvent {
  ts: number
  k: 'news' | 'fund' | 'cancel' | 'order' | 'sl' | 'tp' | 'slhit'
  v?: number | null
  old?: number | null
  ms?: number
}

// R12 계정 프로필 — 선택지 리터럴이 곧 표시 문자열이자 DB 저장값 (Unit 관례와 동일)
export const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대', '60대+'] as const
export const GENDERS = ['남성', '여성'] as const // 아바타 성별 변형용 — 미선택 시 공용 세트
export const MARKETS = ['국내주식', '해외주식', '코인'] as const
export const INSTRUMENTS = ['현물', '선물', '옵션'] as const
export const INVEST_STYLES = ['단타', '스윙', '장기투자'] as const // STYLES 라벨과 동일 어휘
export const EXPERIENCES = ['입문', '1년 미만', '1~3년', '3년 이상'] as const

export interface Profile {
  nickname: string
  ageBand: string | null
  gender: string | null
  markets: string[]
  instruments: string[]
  style: string | null
  experience: string | null
}

// R10 분기 재무 (fundamentals.json — SEC EDGAR, 개별주만) — filedTs(공시일)가 시뮬 노출 기준
export interface FundQuarter {
  filedTs: number // 공시일 unix초 (자정 UTC)
  endTs: number // 회계기간 종료일 — YoY 간격 가드용, 화면엔 절대 표시하지 않는다
  rev: number | null // 매출 USD
  opInc: number | null // 영업이익 USD
  eps: number | null // 희석 EPS, 분할 조정(캔들 조정가와 같은 기준)
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
  events?: SimEvent[] // R6 — optional: 구버전 persist 호환
  done: boolean
}

export interface SimRecord {
  id: string
  endedAt: number
  style: string
  styleLabel?: string
  timeframe?: Timeframe // optional: R7 도입 이전 기록엔 없음 — 리포트의 캔들 환산에 사용
  symbol: string
  startBalance: number
  endBalance: number
  pnlPct: number
  tradeCount: number
  emotion: string
  memo: string
  trades?: Trade[] // optional: 도입 이전 기록엔 없음
  events?: SimEvent[] // optional: R6 도입 이전 기록엔 없음
  // R13 누적 차트시간 — 전부 optional: 도입 이전 기록엔 없음(집계에서 제외)
  elapsedBars?: number // cursor - startIndex, 실제 플레이한 캔들 수
  early?: boolean // 중간 정리(조기 종료) 여부 — cursor < endIndex
  startTs?: number // 시작 캔들 ts (달력 시간 합산용)
  endTs?: number // 마지막으로 플레이한 캔들 ts
}
