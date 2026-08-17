import type { EconIndicator } from '../types'
import type { FundView } from './fund'

// R16 도우미 해석 — LLM(Claude)이 신호 조합별로 생성한 해석 문장을 큐레이션한 코퍼스.
// 런타임 AI 호출 없음: 신호 추출(결정론) → 코퍼스 조회(RAG식). 새 조합이 필요하면
// 오프라인에서 LLM으로 문장을 생성해 여기에 추가한다.
// 원칙: ① nowTs 이전 데이터만 사용 ② 시대·사건·인물·연도 어휘 금지(coach.test.ts가 스캔)
// ③ 매수·매도 지시 금지 — 항상 "보통 ~하는 경향" 서술. (기획서 §6, 유사투자자문 경계)

export interface MacroSignals {
  rateLevel: '저금리' | '중금리' | '고금리'
  rateDir: '인상' | '인하' | '동결'
  inflDir: '상승' | '하락' | '안정'
  inflHigh: boolean // CPI 전년비 4% 이상
  vixZone: '안정' | '주의' | '불안' | '공포'
}

export interface FundSignals {
  revYoy: number | null
  revBand: '고성장' | '성장' | '정체' | '역성장' | null
  opState: '흑자전환' | '적자전환' | '적자지속' | '개선' | '악화' | null
  per: number | null
  perBand: '적자' | '낮음' | '보통' | '높음' | '매우높음' | null
}

const last = (a: number[]) => a[a.length - 1]
const prv = (a: number[]) => a[a.length - 2]

// NewsPanel.vals와 같은 point-in-time 규칙 (strict < nowTs)
const series = (econ: EconIndicator[], id: string, nowTs: number) =>
  (econ.find((e) => e.id === id)?.data.filter((p) => p[0] < nowTs) ?? []).map((p) => p[1])

export function macroSignals(econ: EconIndicator[], nowTs: number): MacroSignals | null {
  const rate = series(econ, 'FFR', nowTs)
  const cpi = series(econ, 'CPI', nowTs)
  const vix = series(econ, 'VIX', nowTs)
  if (rate.length < 2 || cpi.length < 2 || vix.length < 1) return null
  const r = last(rate)
  const rd = r - prv(rate)
  const cd = last(cpi) - prv(cpi)
  const v = last(vix)
  return {
    rateLevel: r < 1.5 ? '저금리' : r < 4 ? '중금리' : '고금리',
    rateDir: rd > 0.05 ? '인상' : rd < -0.05 ? '인하' : '동결',
    inflDir: cd > 0.1 ? '상승' : cd < -0.1 ? '하락' : '안정',
    inflHigh: last(cpi) >= 4,
    vixZone: v < 15 ? '안정' : v < 20 ? '주의' : v < 30 ? '불안' : '공포', // NewsPanel zoneOf와 동일 경계
  }
}

export function fundSignals(view: FundView): FundSignals {
  const r0 = view.rows[0]
  const y = r0?.revYoy ?? null
  const op = r0?.opYoy ?? null
  return {
    revYoy: y,
    revBand: y == null ? null : y >= 20 ? '고성장' : y >= 5 ? '성장' : y > -5 ? '정체' : '역성장',
    opState: op == null ? null : typeof op === 'number' ? (op >= 0 ? '개선' : '악화') : op,
    per: view.per,
    perBand:
      view.per == null
        ? view.perNote === 'TTM 적자' ? '적자' : null
        : view.per < 15 ? '낮음' : view.per < 30 ? '보통' : view.per < 60 ? '높음' : '매우높음',
  }
}

// ── 코퍼스: 거시 (금리 수준 × 방향) ──
const RATE: Record<string, string> = {
  '저금리·인하': '금리를 낮은 수준에서 더 내리는 완화 구간이에요. 돈이 풀리면 보통 주식 같은 위험자산에 우호적이지만, 경기가 많이 식어서 내리는 경우라면 실적 충격이 먼저 올 수도 있어요.',
  '저금리·동결': '금리가 낮은 수준에 머물러 있어요. 싼 이자 덕에 보통 성장주와 위험자산에 유리한 환경으로 해석되는 경우가 많아요.',
  '저금리·인상': '낮았던 금리를 올리기 시작했어요. 보통 경기가 살아났다는 신호로 읽히지만, 그동안 싼 돈에 기대 오르던 자산은 속도 조절을 받는 경향이 있어요.',
  '중금리·인하': '금리를 내리는 구간이에요. 보통 유동성 기대로 주식에 우호적으로 해석되지만, 물가가 잡혀서 내리는지 경기가 나빠져서 내리는지에 따라 흐름이 갈리는 경향이 있어요.',
  '중금리·동결': '금리가 크게 움직이지 않는 구간이에요. 이럴 땐 보통 거시보다 기업 실적 같은 개별 재료가 주가를 끌고 가는 경향이 있어요.',
  '중금리·인상': '금리를 올려가는 긴축 구간이에요. 이자 부담이 커지면 보통 미래 이익 비중이 큰 성장주가 먼저 압박받는 경향이 있어요.',
  '고금리·인하': '높던 금리를 내리기 시작했어요. 보통 시장이 기다리던 신호라 우호적으로 읽히지만, 경기 둔화가 이유라면 초반엔 오히려 흔들리기도 해요.',
  '고금리·동결': '금리가 높은 수준에서 멈춰 있는 구간이에요. 시장은 보통 "언제 내리나"를 기다리며 물가·고용 지표 하나하나에 민감해지는 경향이 있어요.',
  '고금리·인상': '물가를 잡기 위해 금리를 계속 올리는 강한 긴축 구간이에요. 돈값이 비싸질수록 보통 성장주가 압박받고, 현금흐름이 탄탄한 기업이 상대적으로 버티는 경향이 있어요.',
}

const INFL: Record<string, string> = {
  '높음·상승': '물가 상승률이 높고 아직 꺾이지 않았어요. 보통 긴축이 길어질 수 있다는 뜻으로 읽혀요.',
  '높음·둔화': '물가는 여전히 높지만 오름세가 꺾이는 모습이에요. 보통 시장이 이 신호를 가장 반기는 경향이 있어요.',
  '낮음·상승': '물가가 낮은 수준에서 조금씩 오르고 있어요. 아직은 부담보다 경기 회복 신호로 읽히는 경우가 많아요.',
}

const VIX: Record<string, string> = {
  안정: '변동성(VIX)은 안정권이에요. 시장이 차분할 땐 보통 추세가 이어지기 쉬운 환경으로 봐요.',
  주의: '변동성(VIX)이 슬금슬금 올라오고 있어요. 큰 방향이 바뀌기 전의 신경질적인 구간에서 자주 보이는 모습이에요.',
  불안: '변동성(VIX)이 불안 구간이에요. 출렁임이 커서 보통 손절가·목표가 같은 계획의 가치가 커지는 시기예요.',
  공포: '변동성(VIX)이 공포 구간이에요. 급락도 급반등도 큰 시기라, 보통 포지션 크기를 줄여 대응하는 것이 교과서적인 설명이에요.',
}

export function macroCoach(econ: EconIndicator[], nowTs: number): string[] | null {
  const s = macroSignals(econ, nowTs)
  if (!s) return null
  const lines = [RATE[`${s.rateLevel}·${s.rateDir}`]]
  const inflKey = s.inflHigh
    ? s.inflDir === '상승' ? '높음·상승' : '높음·둔화'
    : s.inflDir === '상승' ? '낮음·상승' : null
  // 고금리·인상 문장이 이미 물가를 다루므로 중복 회피
  if (inflKey && !(s.rateLevel === '고금리' && s.rateDir === '인상')) lines.push(INFL[inflKey])
  lines.push(VIX[s.vixZone])
  return lines
}

// ── 코퍼스: 재무 ──
const OP: Record<string, string> = {
  흑자전환: '적자에서 흑자로 돌아섰어요 — 보통 시장이 크게 반기는 변화예요.',
  적자전환: '흑자에서 적자로 돌아섰어요. 일시적인지 구조적인지가 보통 관건이 돼요.',
  적자지속: '아직 이익을 내지 못하고 있어요. 이런 기업의 주가는 실적보다 기대감에 크게 흔들리는 경향이 있어요.',
  개선: '영업이익도 좋아지고 있어요.',
  악화: '다만 영업이익은 나빠지고 있어요.',
}

const pctStr = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

export function fundCoach(view: FundView, macro: MacroSignals | null): string[] | null {
  const s = fundSignals(view)
  if (!s.revBand && !s.opState && !s.perBand) return null
  const lines: string[] = []

  // 1) 실적 요약
  const rev =
    s.revBand === '고성장' ? `매출이 1년 전보다 ${pctStr(s.revYoy!)} 늘어난 고성장 국면이에요.`
    : s.revBand === '성장' ? `매출이 1년 전보다 ${pctStr(s.revYoy!)} 늘며 꾸준히 크고 있어요.`
    : s.revBand === '정체' ? `매출이 1년 전과 비슷한 수준이에요(${pctStr(s.revYoy!)}).`
    : s.revBand === '역성장' ? `매출이 1년 전보다 ${pctStr(s.revYoy!)} 줄었어요.`
    : null
  const op = s.opState ? OP[s.opState] : null
  if (rev || op) lines.push([rev, op].filter(Boolean).join(' '))

  // 2) 가치평가 (+ 거시 교차)
  if (s.perBand) {
    let val =
      s.perBand === '적자' ? '적자 기업이라 PER로는 가치를 재기 어려워요. 보통 매출 성장 속도와 현금이 얼마나 버티는지를 대신 봐요.'
      : s.perBand === '낮음' ? `PER ${s.per!.toFixed(1)}배로 이익 대비 주가가 낮은 편이에요. 다만 싼 데는 이유가 있는 경우도 많아서, 이익이 유지되는지가 보통 관건이에요.`
      : s.perBand === '보통' ? `PER ${s.per!.toFixed(1)}배로 이익 대비 주가가 부담스럽지 않은 수준이에요.`
      : s.perBand === '높음' ? `PER ${s.per!.toFixed(1)}배로 이익 대비 주가가 높은 편이에요 — 시장이 미래 성장을 미리 값에 반영하고 있다는 뜻이에요.`
      : `PER ${s.per!.toFixed(1)}배로 기대감이 아주 크게 실려 있어요. 기대가 조금만 어긋나도 크게 흔들릴 수 있는 가격대예요.`
    if (macro?.rateDir === '인상' && (s.perBand === '높음' || s.perBand === '매우높음'))
      val += ' 게다가 금리까지 오르는 구간이라, 보통 이런 조합은 밸류에이션 부담이 커지는 시기로 해석돼요.'
    else if (macro?.rateDir === '인하' && s.revBand === '고성장')
      val += ' 금리가 내려가는 구간이라 보통 성장주에 우호적인 환경으로 읽혀요.'
    lines.push(val)
  }

  // 3) 펀더멘털 판정
  const strong = (s.revBand === '고성장' || s.revBand === '성장') && (s.opState === '개선' || s.opState === '흑자전환')
  const weak = s.revBand === '역성장' || s.opState === '적자전환' || (s.opState === '적자지속' && s.revBand !== '고성장')
  lines.push(
    strong ? '종합하면 펀더멘털은 흔들리지 않는 것처럼 보여요. 주가가 출렁여도 실적이 받쳐주는 그림이에요.'
    : weak ? '종합하면 펀더멘털이 약해지는 신호가 있어요. 주가 반등이 나와도 실적 확인 전까지는 보통 조심스럽게 해석해요.'
    : '종합하면 신호가 엇갈려요. 이런 때는 보통 다음 분기 공시가 방향을 정해주는 경우가 많아요.',
  )
  return lines
}
