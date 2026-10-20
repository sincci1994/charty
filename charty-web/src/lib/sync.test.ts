import { describe, expect, it } from 'vitest'
import type { ActiveSim, CustomStyle, SimRecord } from '../types'
import { START_BALANCE } from './data'
import { decideSync, pickState, reconcile } from './sync'

const rec = (id: string, endedAt: number): SimRecord =>
  ({ id, endedAt, style: 'SWING', symbol: 'QQQ', startBalance: 1e6, endBalance: 1e6, pnlPct: 0, tradeCount: 0, emotion: '😐', memo: '' })

describe('reconcile', () => {
  it('id 합집합을 최신순으로 병합, 서버에 없는 로컬만 push 대상', () => {
    const local = [rec('b', 200), rec('a', 100)]
    const server = [rec('c', 300), rec('a', 100)]
    const { merged, toPush } = reconcile(local, server)
    expect(merged.map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(toPush.map((r) => r.id)).toEqual(['b'])
  })
  it('같은 id는 로컬 판본 하나만 남는다', () => {
    const { merged } = reconcile([rec('a', 100)], [rec('a', 100)])
    expect(merged).toHaveLength(1)
  })
  it('빈 양쪽도 안전', () => {
    expect(reconcile([], [])).toEqual({ merged: [], toPush: [] })
  })
})

describe('pickState — 동기화 슬라이스 경계', () => {
  it('기기 로컬 설정이 새어 들어오지 않는다 (LWW 시계 오염 방지)', () => {
    const s = { balance: 1e6, activeSim: null, customs: [], waitlistAt: null }
    expect(Object.keys(pickState(s)).sort()).toEqual(['activeSim', 'balance', 'customs', 'waitlistAt'])
  })
})

// 로그인 시 state 행 정책 — 행 있음: 클라이언트 updated_at LWW / 행 없음: 기기 고유 정보가 있을 때만 시드
describe('decideSync', () => {
  const L = (o: Partial<Parameters<typeof decideSync>[0]> = {}) =>
    ({ balance: START_BALANCE, activeSim: null, customs: [], waitlistAt: null, stateUpdatedAt: 0, records: [], ...o })
  it('행이 있으면 더 새로운 쪽이 이긴다 — 같으면 아무것도 안 함', () => {
    expect(decideSync(L({ stateUpdatedAt: 100 }), { updatedAt: 200 })).toBe('apply')
    expect(decideSync(L({ stateUpdatedAt: 300 }), { updatedAt: 200 })).toBe('push')
    expect(decideSync(L({ stateUpdatedAt: 200 }), { updatedAt: 200 })).toBe('none')
  })
  it('행이 없고 잔고가 기록에서 파생된 값뿐이면 시드하지 않는다 — 새 기기의 빈 시드가 실데이터를 이기는 사고 방지', () => {
    expect(decideSync(L(), null)).toBe('none')
    expect(decideSync(L({ records: [rec('a', 100)], balance: 1e6, stateUpdatedAt: 50 }), null)).toBe('none')
  })
  it('행이 없어도 스피드 손익(기록 밖 잔고)은 정보라 시드한다', () => {
    expect(decideSync(L({ records: [rec('a', 100)], balance: 1.2e6, stateUpdatedAt: 50 }), null)).toBe('push')
    expect(decideSync(L({ balance: 12e6, stateUpdatedAt: 50 }), null)).toBe('push')
  })
  it('스탬프 0인 불일치는 08-15 이전 100만 스케일 잔재라 시드하지 않는다', () => {
    expect(decideSync(L({ balance: 1e6 }), null)).toBe('none')
  })
  it('행이 없어도 커스텀·진행 세션·waitlist는 state 행이 유일본이라 시드한다', () => {
    expect(decideSync(L({ customs: [{ id: 'x' } as CustomStyle] }), null)).toBe('push')
    expect(decideSync(L({ activeSim: { id: 's' } as ActiveSim }), null)).toBe('push')
    expect(decideSync(L({ waitlistAt: 1 }), null)).toBe('push')
  })
  // 게스트 → 계정 로그인: shell이 로컬 스탬프를 0으로 내리고 리셋 전 스탬프를 guestStamp로 넘긴다
  it('게스트 → 새 계정(행 없음): 리셋 전 스탬프로 시드 판단 — 스피드로 번 돈이 계정에 올라간다', () => {
    expect(decideSync(L({ balance: 12.4e6 }), null, 5000)).toBe('push')
  })
  it('게스트 → 기존 계정(행 있음): 게스트가 더 최근이어도 계정이 이긴다', () => {
    expect(decideSync(L({ balance: 12.4e6 }), { updatedAt: 3000 }, 5000)).toBe('apply')
  })
})
