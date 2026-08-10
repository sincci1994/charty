import type { FundQuarter } from '../types'

// R10 재무 탭 파생 계산 — 노출 규칙(공시일 필터·상대 라벨)이 전부 여기 모임.
// 렌더 계층에는 절대 날짜를 포맷하는 코드를 두지 않는다 (블라인드 정책).
// 알려진 오차원(교육용 수용): filed는 날짜 단위(자정 UTC)라 실제 제출 시각보다 최대 하루 이르지만,
// 실적은 보도자료로 10-Q보다 며칠 먼저 공개되는 게 현실이라 미래 누출은 아님.
// 파생 Q4 EPS는 가중평균 주식수 차이로 근사, 캔들의 배당 조정 탓에 과거 PER은 수% 과소.

const DAY = 86400

export type OpYoy = number | '흑자전환' | '적자전환' | '적자지속' | null

export interface FundRow {
  rel: string // '최근 분기' | 'N분기 전' — 상대 라벨만
  rev: number | null
  opInc: number | null
  revYoy: number | null
  opMargin: number | null
  opYoy: OpYoy
}

export interface FundView {
  isNew: boolean // 최근 공시가 7일 내 (NewsPanel isNew 관례)
  per: number | null // TTM — null이면 perNote에 사유
  perNote: string | null
  rows: FundRow[] // 최신 분기부터 최대 4개
}

// 영업이익 YoY — 부호에 따라 % 또는 전환 라벨 (음수 기저의 %는 무의미)
export function opTransition(cur: number | null, prev: number | null): OpYoy {
  if (cur == null || prev == null) return null
  if (prev > 0) return cur > 0 ? ((cur - prev) / prev) * 100 : '적자전환'
  return cur > 0 ? '흑자전환' : '적자지속'
}

export function fundView(qs: FundQuarter[], nowTs: number, price: number): FundView | null {
  const known = qs.filter((q) => q.filedTs < nowTs) // NewsPanel과 같은 strict < 관례
  if (known.length === 0) return null

  // 전년 동기 = 4분기 전 행 + 간격 가드 (초기 연도 결측 갭이면 비교 포기)
  const yearAgo = (i: number): FundQuarter | null => {
    const b = known[i - 4]
    if (!b) return null
    const gap = known[i].endTs - b.endTs
    return gap > 330 * DAY && gap < 400 * DAY ? b : null
  }

  const rows: FundRow[] = []
  for (let i = known.length - 1; i >= 0 && rows.length < 4; i--) {
    const q = known[i]
    const b = yearAgo(i)
    rows.push({
      rel: rows.length === 0 ? '최근 분기' : `${rows.length}분기 전`,
      rev: q.rev,
      opInc: q.opInc,
      revYoy: q.rev != null && b?.rev != null && b.rev > 0 ? ((q.rev - b.rev) / b.rev) * 100 : null,
      opMargin: q.opInc != null && q.rev != null && q.rev > 0 ? (q.opInc / q.rev) * 100 : null,
      opYoy: opTransition(q.opInc, b?.opInc ?? null),
    })
  }

  // PER(TTM) = 현재가 ÷ 최근 4개 알려진 분기 EPS 합 — 4분기가 연속(~1년)일 때만
  const last4 = known.slice(-4)
  const span = last4.length === 4 ? last4[3].endTs - last4[0].endTs : 0
  const ttm = last4.length === 4 && span > 240 * DAY && span < 300 * DAY && last4.every((q) => q.eps != null)
    ? last4.reduce((s, q) => s + q.eps!, 0)
    : null
  const per = ttm != null && ttm > 0 ? price / ttm : null

  return {
    isNew: nowTs - known[known.length - 1].filedTs < 7 * DAY,
    per,
    perNote: per != null ? null : ttm != null ? 'TTM 적자' : '분기 데이터 부족',
    rows,
  }
}

// $109.4B / $21M 축약 — 재무 절대액용
export const fmtUsd = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}M` : `$${a.toFixed(0)}`
  return v < 0 ? `-${s}` : s
}
