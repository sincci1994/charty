import { describe, expect, it, vi } from 'vitest'
import { useStore } from './store'
import { START_BALANCE } from './lib/data'
import { initStateSync } from './lib/sync'
import type { CustomStyle, SimRecord } from './types'

// 로그아웃이 지나는 유일한 리셋 — 지울 것과 남길 것이 뒤바뀌면 여기서 깨진다
describe('wipeLocal', () => {
  it('계정 데이터만 비우고 기기 설정(theme·coach)은 남긴다', () => {
    useStore.setState({
      balance: 1, records: [{ id: 'a' } as SimRecord], welcomed: true, stateUpdatedAt: 123,
      theme: 'dark', coach: false,
    })
    useStore.getState().wipeLocal()
    const s = useStore.getState()
    expect([s.balance, s.records, s.welcomed, s.stateUpdatedAt]).toEqual([START_BALANCE, [], false, 0])
    expect([s.theme, s.coach]).toEqual(['dark', false]) // 로그아웃이 다크모드를 풀면 버그
  })

  it('예약된 디바운스 push를 끊는다 — 빈 슬라이스가 올라가면 customs는 state 행이 유일본이라 소실', () => {
    vi.useFakeTimers()
    try {
      initStateSync()
      useStore.setState({ customs: [{ id: 'x' } as CustomStyle] })
      expect(vi.getTimerCount()).toBe(1) // 2초 디바운스 무장
      useStore.getState().wipeLocal()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
