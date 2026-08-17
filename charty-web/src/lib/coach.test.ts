import { describe, expect, it } from 'vitest'
// @ts-expect-error — vite raw import (금지어 스캔은 인라인 템플릿 포함 소스 전체 대상)
import coachSrc from './coach.ts?raw'
import { fundCoach, fundSignals, macroCoach, macroSignals } from './coach'
import type { FundRow, FundView, OpYoy } from './fund'
import type { EconIndicator } from '../types'

const NOW = 1000
const econOf = (ffr: number[], cpi: number[], vix: number[]): EconIndicator[] => [
  { id: 'FFR', data: ffr.map((v, i) => [i + 1, v] as [number, number]) },
  { id: 'CPI', data: cpi.map((v, i) => [i + 1, v] as [number, number]) },
  { id: 'VIX', data: vix.map((v, i) => [i + 1, v] as [number, number]) },
]

const row = (revYoy: number | null, opYoy: OpYoy): FundRow =>
  ({ rel: '최근 분기', rev: null, opInc: null, revYoy, opMargin: null, opYoy })
const viewOf = (rows: FundRow[], per: number | null = null, perNote: string | null = null): FundView =>
  ({ isNew: false, per, perNote, rows })

describe('macroSignals', () => {
  it('금리 수준·방향·물가·VIX 존 경계', () => {
    const s = macroSignals(econOf([3.5, 4.0], [4.0, 4.0], [31]), NOW)!
    expect(s).toMatchObject({ rateLevel: '고금리', rateDir: '인상', inflDir: '안정', inflHigh: true, vixZone: '공포' })
    const s2 = macroSignals(econOf([1.5, 1.49], [2.0, 2.2], [14.9]), NOW)!
    expect(s2).toMatchObject({ rateLevel: '저금리', rateDir: '동결', inflDir: '상승', inflHigh: false, vixZone: '안정' })
    const s3 = macroSignals(econOf([2.0, 1.9], [5.0, 4.5], [22]), NOW)!
    expect(s3).toMatchObject({ rateLevel: '중금리', rateDir: '인하', inflDir: '하락', vixZone: '불안' })
  })

  it('nowTs 이후 데이터는 무시, 2점 미만이면 null', () => {
    const econ: EconIndicator[] = [
      { id: 'FFR', data: [[1, 1], [2, 5], [NOW + 1, 9]] }, // 미래 9%는 무시 → 저금리 아님, 5%
      { id: 'CPI', data: [[1, 2], [2, 2]] },
      { id: 'VIX', data: [[1, 10]] },
    ]
    expect(macroSignals(econ, NOW)!.rateLevel).toBe('고금리')
    expect(macroSignals(econOf([1], [2, 2], [10]), NOW)).toBeNull()
  })
})

describe('macroCoach', () => {
  it('고금리·인상은 물가 문장을 중복 생략 (금리 문장이 이미 다룸)', () => {
    const lines = macroCoach(econOf([4.0, 4.5], [5.0, 5.2], [25]), NOW)!
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('긴축')
    expect(lines[1]).toContain('불안')
  })
  it('물가 둔화 신호는 별도 문장으로', () => {
    const lines = macroCoach(econOf([5.0, 5.0], [6.0, 5.5], [18]), NOW)!
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('꺾이는')
  })
})

describe('fundSignals', () => {
  it('매출·PER 밴드 경계', () => {
    expect(fundSignals(viewOf([row(20, null)])).revBand).toBe('고성장')
    expect(fundSignals(viewOf([row(19.9, null)])).revBand).toBe('성장')
    expect(fundSignals(viewOf([row(4.9, null)])).revBand).toBe('정체')
    expect(fundSignals(viewOf([row(-5, null)])).revBand).toBe('역성장')
    expect(fundSignals(viewOf([row(null, null)], 14.9)).perBand).toBe('낮음')
    expect(fundSignals(viewOf([row(null, null)], 30)).perBand).toBe('높음')
    expect(fundSignals(viewOf([row(null, null)], 60)).perBand).toBe('매우높음')
    expect(fundSignals(viewOf([row(null, null)], null, 'TTM 적자')).perBand).toBe('적자')
  })
})

describe('fundCoach', () => {
  it('성장+이익 개선 → 펀더멘털 견조 + 고PER×금리인상 교차', () => {
    const macro = macroSignals(econOf([4.0, 4.5], [5.0, 5.2], [25]), NOW)
    const lines = fundCoach(viewOf([row(25, 30)], 35), macro)!
    expect(lines[0]).toContain('+25.0%')
    expect(lines[1]).toContain('밸류에이션 부담')
    expect(lines[2]).toContain('흔들리지 않는')
  })
  it('역성장·적자지속 → 약화 판정', () => {
    const lines = fundCoach(viewOf([row(-10, '적자지속')], null, 'TTM 적자'), null)!
    expect(lines.at(-1)).toContain('약해지는')
  })
  it('신호 엇갈림 → 유보 판정, 신호 전무 → null', () => {
    expect(fundCoach(viewOf([row(0, null)], 20), null)!.at(-1)).toContain('엇갈려요')
    expect(fundCoach(viewOf([row(null, null)]), null)).toBeNull()
  })
})

describe('블라인드 안전 — 코퍼스 금지어', () => {
  it('시대·사건·인물·연도 어휘가 소스 전체에 없다', () => {
    const src = coachSrc as string
    expect(src).not.toMatch(/\b(19|20)\d{2}\b/)
    for (const w of ['팬데믹', '코로나', '금융위기', '리먼', '닷컴', '서브프라임', '브렉시트', '전쟁', '트럼프', '바이든', '파월', '버냉키'])
      expect(src).not.toContain(w)
  })
})
