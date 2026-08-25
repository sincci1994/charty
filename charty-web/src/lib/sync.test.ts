import { describe, expect, it } from 'vitest'
import type { SimRecord } from '../types'
import { pickState, reconcile } from './sync'

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
