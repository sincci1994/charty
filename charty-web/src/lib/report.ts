import type { SimEvent, SimRecord, Trade } from '../types'
import { TF } from './data'

// R7 행동 리포트 계산 — 표현 원칙: 심리 단정 금지, [조건]+[수치]+[관찰된 행동]만.
// 여기 함수들은 문장까지 만들어 반환한다 (문구 규칙을 한 곳에 모으기 위해).

export interface Observation {
  glyph: string
  text: string
  basis: string
}

export interface Metric {
  title: string
  locked: boolean
  lockText?: string
  lockPct?: number // 0~100 진행 바
  value?: string
  tone?: 'up' | 'down' | 'accent' | 'text'
  desc?: string
  basis?: string
}

// ── 기초 집계 ──────────────────────────────────────────────

// 포지션 에피소드: 첫 매수(0→보유)부터 전량 청산(보유→0)까지. LONG(현물)만 — 구버전 SHORT 거래는 무시
interface Episode {
  startTs: number
  endTs: number
  pnl: number
}

export function episodes(trades: Trade[]): Episode[] {
  const done: Episode[] = []
  let qty = 0
  let cur: Episode | null = null
  for (const t of trades) {
    if (t.side === 'OPEN_LONG') {
      if (qty === 0) cur = { startTs: t.ts, endTs: t.ts, pnl: 0 }
      qty += t.qty
    } else if (t.side === 'CLOSE_LONG' && cur) {
      qty -= t.qty
      cur.pnl += t.pnl ?? 0
      cur.endTs = t.ts
      if (qty <= 0) {
        qty = 0
        done.push(cur)
        cur = null
      }
    }
  }
  return done
}

// 손실 매도 직후 첫 매수 금액 / "평소"(손실 직후가 아닌 매수) 평균 금액 비율들
// 분모에 손실 직후 매수 자신을 넣으면 패턴이 강할수록 희석되므로 제외한다. 첫 매수는 항상 분모에 남는다.
export function postLossRatios(trades: Trade[]): number[] {
  const buys = trades.filter((t) => t.side === 'OPEN_LONG')
  if (buys.length < 2) return [] // 비교 기준이 성립하려면 매수 2회 이상
  const post = new Set<Trade>()
  let lossPending = false
  for (const t of trades) {
    if (t.side === 'CLOSE_LONG' && (t.pnl ?? 0) < 0) lossPending = true
    else if (t.side === 'OPEN_LONG' && lossPending) {
      post.add(t)
      lossPending = false
    }
  }
  if (post.size === 0) return []
  const base = buys.filter((t) => !post.has(t))
  const avg = base.reduce((s, t) => s + t.price * t.qty, 0) / base.length
  return [...post].map((t) => (t.price * t.qty) / avg)
}

// 뉴스 열람 각각에 대해 "바로 다음 이벤트"가 무엇이었는지 (판단 변경 = cancel/sl/tp)
// 시간 창 대신 이벤트 순서로 정의 — 타임프레임 무관, 결정적. 다음이 또 뉴스거나 신규 주문이면 유지로 본다.
// slhit은 사용자 행동이 아니므로 건너뜀
export function newsFollowups(events: SimEvent[]): { views: number; changes: number; cancels: number; riskEdits: number } {
  let views = 0
  let changes = 0
  let cancels = 0
  let riskEdits = 0
  for (let i = 0; i < events.length; i++) {
    if (events[i].k !== 'news') continue
    views++
    const next = events.slice(i + 1).find((e) => e.k !== 'slhit')
    if (!next || next.k === 'order' || next.k === 'news') continue
    changes++
    if (next.k === 'cancel') cancels++
    else riskEdits++
  }
  return { views, changes, cancels, riskEdits }
}

// 손절 계획가 도달(slhit) 중 3캔들 내 매도 체결로 이어진 횟수
// 사용자 매도만 (강제 청산 forced 제외), 매도 1건은 도달 1건에만 매칭.
// 창은 도달 "다음" 캔들부터 — 같은 캔들 체결은 도달을 보고 반응한 매도일 수 없다(기존 지정매도)
export function slExecution(trades: Trade[], events: SimEvent[], tfSec: number): { hits: number; executed: number } {
  const hits = events.filter((e) => e.k === 'slhit')
  const sells = trades.filter((t) => t.side === 'CLOSE_LONG' && !t.forced)
  const used = new Set<Trade>()
  let executed = 0
  for (const h of hits) {
    const m = sells.find((t) => !used.has(t) && t.ts > h.ts && t.ts <= h.ts + 3 * tfSec)
    if (m) {
      used.add(m)
      executed++
    }
  }
  return { hits: hits.length, executed }
}

export function reasonDist(trades: Trade[]): { name: string; n: number }[] {
  const count = new Map<string, number>()
  for (const t of trades) for (const r of t.reasons ?? []) count.set(r, (count.get(r) ?? 0) + 1)
  return [...count.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
}

// ── 화면 A: 세션 리포트 ────────────────────────────────────

export function sessionObservations(trades: Trade[], events: SimEvent[], tfSec: number): Observation[] {
  const obs: Observation[] = []

  const ratios = postLossRatios(trades)
  if (ratios.length > 0) {
    const diff = Math.round((ratios.reduce((s, r) => s + r, 0) / ratios.length - 1) * 100)
    if (Math.abs(diff) >= 10) {
      obs.push({
        glyph: diff > 0 ? '↗' : '↘',
        text: `손실 확정 직후 첫 주문 금액이 평소 매수보다 ${Math.abs(diff)}% ${diff > 0 ? '컸습니다' : '작았습니다'}`,
        basis: `손실 직후 매수 ${ratios.length}회 기준`,
      })
    }
  }

  const eps = episodes(trades)
  const wins = eps.filter((e) => e.pnl > 0)
  const losses = eps.filter((e) => e.pnl < 0)
  if (wins.length >= 1 && losses.length >= 1) {
    const avgCandles = (a: Episode[]) => Math.max(1, Math.round(a.reduce((s, e) => s + (e.endTs - e.startTs), 0) / a.length / tfSec))
    obs.push({
      glyph: '◷',
      text: `수익 매매는 평균 ${avgCandles(wins)}캔들, 손실 매매는 평균 ${avgCandles(losses)}캔들 보유했습니다`,
      basis: `매도 완료 ${eps.length}건 기준`,
    })
  }

  const sl = slExecution(trades, events, tfSec)
  if (sl.hits >= 1)
    obs.push({
      glyph: '◎',
      text: `설정한 손절가 도달 ${sl.hits}회 중 ${sl.executed}회는 계획대로 실행했습니다`,
      basis: `손절 계획을 입력한 보유 기준`,
    })

  const nf = newsFollowups(events)
  if (nf.cancels >= 1)
    obs.push({ glyph: '☰', text: `뉴스 확인 후 대기 중이던 주문을 취소했습니다`, basis: `뉴스 탭 이동 직후 ${nf.cancels}회` })
  else if (nf.riskEdits >= 1)
    obs.push({ glyph: '☰', text: `뉴스 확인 후 손절·목표 계획을 변경했습니다`, basis: `뉴스 탭 이동 직후 ${nf.riskEdits}회` })

  return obs.slice(0, 4)
}

// ── 화면 B: 누적 리포트 ────────────────────────────────────

export const NEED_SESSIONS = 3 // 전체 잠금 해제 기준

export interface CumulativeReport {
  judged: number // 판단 기록이 있는 세션 수
  legacy: number // 분석에서 제외되는 구버전 세션 수
  metrics: Metric[]
}

export function cumulativeReport(records: SimRecord[]): CumulativeReport {
  const withTrades = records.filter((r) => (r.trades?.length ?? 0) > 0)
  const judgedRecs = withTrades.filter((r) => r.trades!.some((t) => t.reasons?.length))
  const judged = judgedRecs.length
  const legacy = withTrades.length - judged // 거래는 있는데 판단 기록이 없는 구버전 세션 (무거래 세션은 legacy 아님)
  const metrics: Metric[] = []

  // M1. 손절 계획 실행률 — 손절 계획 입력(주문 시점 + 보유 중 설정) 10회부터.
  // 게이트와 측정이 같은 모집단을 보도록 setRisk 이벤트도 센다
  {
    const NEED = 10
    const slPlans = judgedRecs.reduce(
      (s, r) =>
        s +
        r.trades!.filter((t) => t.side === 'OPEN_LONG' && t.sl != null).length +
        (r.events ?? []).filter((e) => e.k === 'sl').length,
      0,
    )
    if (slPlans < NEED) {
      metrics.push({
        title: '손절 계획 실행률',
        locked: true,
        lockText: `손절 계획 입력 ${NEED}회부터 계산돼요 (현재 ${slPlans}회)`,
        lockPct: Math.round((slPlans / NEED) * 100),
      })
    } else {
      let hits = 0
      let executed = 0
      for (const r of judgedRecs) {
        const s = slExecution(r.trades!, r.events ?? [], TF[r.timeframe ?? '1h'].sec)
        hits += s.hits
        executed += s.executed
      }
      metrics.push(
        hits === 0
          ? { title: '손절 계획 실행률', locked: false, value: '—', tone: 'text', desc: '아직 손절가 도달이 없었어요', basis: `손절 계획 입력 ${slPlans}회 기준` }
          : {
              title: '손절 계획 실행률',
              locked: false,
              value: `${Math.round((executed / hits) * 100)}%`,
              tone: 'accent',
              desc: `도달 ${hits}회 중 ${executed}회 계획대로 실행`,
              basis: `최근 ${judged}세션 · 손절 계획 입력 ${slPlans}회 기준`,
            },
      )
    }
  }

  // M2. 손실 직후 주문 금액 — 구버전 기록도 계산 가능 (trades만 있으면 됨)
  {
    const NEED = 5
    const ratios = withTrades.flatMap((r) => postLossRatios(r.trades!))
    if (ratios.length < NEED) {
      metrics.push({
        title: '손실 직후 주문 금액',
        locked: true,
        lockText: `손실 직후 주문 ${NEED}회부터 계산돼요 (현재 ${ratios.length}회)`,
        lockPct: Math.round((ratios.length / NEED) * 100),
      })
    } else {
      const diff = Math.round((ratios.reduce((s, r) => s + r, 0) / ratios.length - 1) * 100)
      metrics.push({
        title: '손실 직후 주문 금액',
        locked: false,
        value: `${diff >= 0 ? '+' : ''}${diff}%`,
        tone: diff >= 10 ? 'down' : 'text',
        desc: diff >= 10 ? '손실 직후 첫 주문이 평소보다 커요' : diff <= -10 ? '손실 직후 첫 주문이 평소보다 작아요' : '손실 직후에도 주문 금액이 비슷해요',
        basis: `최근 ${withTrades.length}세션 · 손실 직후 매수 ${ratios.length}회 기준`,
      })
    }
  }

  // M3. 수익·손실 보유시간 — 세션 내 비율(단위 무관)의 평균. 수익·손실이 모두 있는 세션만 기여
  {
    const NEED = 3
    let epTotal = 0 // 실제 계산에 기여한 세션의 에피소드만
    const perRecord: number[] = []
    for (const r of withTrades) {
      const eps = episodes(r.trades!)
      const w = eps.filter((e) => e.pnl > 0)
      const l = eps.filter((e) => e.pnl < 0)
      if (w.length && l.length) {
        const avg = (a: Episode[]) => a.reduce((s, e) => s + (e.endTs - e.startTs), 0) / a.length
        const winAvg = avg(w)
        if (winAvg > 0) {
          perRecord.push(avg(l) / winAvg)
          epTotal += eps.length
        }
      }
    }
    if (perRecord.length < NEED) {
      metrics.push({
        title: '수익·손실 보유시간',
        locked: true,
        lockText: `수익·손실이 모두 있는 세션 ${NEED}개부터 계산돼요 (현재 ${perRecord.length}개)`,
        lockPct: Math.round((perRecord.length / NEED) * 100),
      })
    } else {
      const ratio = perRecord.reduce((s, r) => s + r, 0) / perRecord.length
      metrics.push({
        title: '수익·손실 보유시간',
        locked: false,
        value: `${ratio.toFixed(1)}배`,
        tone: 'text',
        desc: ratio >= 1 ? '손실 매매를 그만큼 오래 보유' : '수익 매매를 더 오래 보유',
        basis: `세션 ${perRecord.length}개 · 매도 완료 ${epTotal}건 기준`,
      })
    }
  }

  // M4. 뉴스 후 판단 변경률 — 뉴스 열람 5회부터. 거래 없이 뉴스만 본 세션도 이벤트가 있으면 집계
  {
    const NEED = 5
    const withEvents = records.filter((r) => (r.events?.length ?? 0) > 0)
    let views = 0
    let changes = 0
    for (const r of withEvents) {
      const nf = newsFollowups(r.events!)
      views += nf.views
      changes += nf.changes
    }
    if (views < NEED) {
      metrics.push({
        title: '뉴스 후 판단 변경률',
        locked: true,
        lockText: `뉴스 열람 ${NEED}회부터 계산돼요 (현재 ${views}회)`,
        lockPct: Math.round((views / NEED) * 100),
      })
    } else {
      metrics.push({
        title: '뉴스 후 판단 변경률',
        locked: false,
        value: `${Math.round((changes / views) * 100)}%`,
        tone: 'accent',
        desc: '뉴스 확인 후 기존 결정을 변경한 비율',
        basis: `최근 ${withEvents.length}세션 · 뉴스 열람 ${views}회 기준`,
      })
    }
  }

  return { judged, legacy, metrics }
}
