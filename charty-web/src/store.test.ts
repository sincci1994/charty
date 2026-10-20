import { describe, expect, it, vi } from 'vitest'
import { useStore } from './store'
import { START_BALANCE } from './lib/data'
import { SPEED } from './lib/speed'
import { initStateSync } from './lib/sync'
import type { ActiveSim, Candle, CustomStyle, SimRecord } from './types'

// 스피드 1판 — 진입(59번) 종가 100, 다음 캔들(60번) 고가 106이라 롱은 즉시 TP(105), 숏은 끝까지 제자리
const round = (entryClose = 100) => {
  const candles: Candle[] = Array.from({ length: SPEED.lookback + SPEED.period }, () => ({ ts: 1, o: 100, h: 101, l: 99, c: 100, v: 1e6 }))
  candles[SPEED.lookback] = { ...candles[SPEED.lookback], h: 106 }
  candles[SPEED.lookback - 1] = { ...candles[SPEED.lookback - 1], c: entryClose }
  return { symbol: 'TEST', candles }
}

describe('playSpeed', () => {
  it('누르는 즉시 잔고 절반을 걸어 정산 — 롱 TP 도달', () => {
    useStore.setState({ balance: 10_000_000, activeSim: null })
    const play = useStore.getState().playSpeed(round(), 'long')
    expect(play).toMatchObject({ dir: 'long', stake: 5_000_000, pnl: 239_510, hitTp: true, before: 10_000_000 })
    expect(useStore.getState().balance).toBe(10_239_510)
  })
  it('숏이 제자리로 끝나면 수수료만큼 잃는다', () => {
    useStore.setState({ balance: 10_000_000, activeSim: null })
    expect(useStore.getState().playSpeed(round(), 'short')).toMatchObject({ pnl: -9_990, hitTp: false })
    expect(useStore.getState().balance).toBe(9_990_010)
  })
  it('진행 중인 연습이 있으면 거부 — 회고 저장이 잔고를 세션 현금으로 덮어써 손익이 사라진다', () => {
    useStore.setState({ balance: 10_000_000, activeSim: { id: 's', done: true } as ActiveSim })
    expect(useStore.getState().playSpeed(round(), 'long')).toBeNull()
    expect(useStore.getState().balance).toBe(10_000_000)
    useStore.setState({ activeSim: null })
  })
  it('로그인·탭 복귀 대사 중엔 거부 — 낡은 잔고 위의 탭이 새 스탬프로 다른 기기의 더 새 잔고를 덮는다', () => {
    useStore.setState({ balance: 10_000_000, activeSim: null, syncing: true })
    expect(useStore.getState().playSpeed(round(), 'long')).toBeNull()
    expect(useStore.getState().balance).toBe(10_000_000)
    useStore.setState({ syncing: false })
  })
  it('계산이 깨지면(NaN) 거부 — JSON이 NaN을 null로 바꿔 모든 기기 잔고가 깨진다', () => {
    useStore.setState({ balance: 10_000_000, activeSim: null })
    expect(useStore.getState().playSpeed(round(NaN), 'long')).toBeNull()
    expect(useStore.getState().balance).toBe(10_000_000)
  })
})

// 서버 대사 후 잔고 — 스피드 손익은 기록 밖에 있어서, '이 기기가 몰랐던 기록'이 최신일 때만 그 종료 잔고를 따른다
describe('applySync', () => {
  const rec = (id: string, endedAt: number, endBalance: number) => ({ id, endedAt, endBalance }) as SimRecord
  it('빈 기기에 복원 — 최신 기록의 종료 잔고를 채택', () => {
    useStore.setState({ records: [], balance: START_BALANCE, stateUpdatedAt: 0 })
    useStore.getState().applySync([rec('b', 200, 12e6), rec('a', 100, 11e6)])
    expect(useStore.getState().balance).toBe(12e6)
    expect(useStore.getState().records.map((r) => r.id)).toEqual(['b', 'a'])
  })
  it('최신 기록이 이미 로컬에 있으면 로컬 잔고 유지 — 탭 복귀 때마다 스피드 손익이 증발하던 버그', () => {
    useStore.setState({ records: [rec('a', 100, 11e6)], balance: 13e6, stateUpdatedAt: 150 })
    useStore.getState().applySync([rec('a', 100, 11e6)])
    expect(useStore.getState().balance).toBe(13e6)
  })
  it('다른 기기의 더 새 기록이 오면 그 잔고를 따른다', () => {
    useStore.setState({ records: [rec('a', 100, 11e6)], balance: 13e6, stateUpdatedAt: 150 })
    useStore.getState().applySync([rec('c', 300, 9e6), rec('a', 100, 11e6)])
    expect(useStore.getState().balance).toBe(9e6)
  })
  it('늦게 올라온 남의 기록이라도 로컬 state가 그 뒤에 바뀌었으면 유지 — 같은 스탬프면 LWW가 못 고친다', () => {
    useStore.setState({ records: [rec('r0', 100, 10e6)], balance: 12e6, stateUpdatedAt: 400 })
    useStore.getState().applySync([rec('r1', 200, 11e6), rec('r0', 100, 10e6)])
    expect(useStore.getState().balance).toBe(12e6)
    expect(useStore.getState().records.map((r) => r.id)).toEqual(['r1', 'r0'])
  })
  it('기기 간 시계 차로 로컬 맨 앞이 최신이 아니어도, 최신이 로컬에 있으면 유지', () => {
    useStore.setState({ records: [rec('n', 150, 12e6), rec('s', 500, 11e6)], balance: 12.5e6, stateUpdatedAt: 600 })
    useStore.getState().applySync([rec('s', 500, 11e6), rec('n', 150, 12e6)])
    expect(useStore.getState().balance).toBe(12.5e6)
  })
  it('서버·로컬 모두 기록이 없으면 잔고 유지 (스피드만 한 사용자)', () => {
    useStore.setState({ records: [], balance: 13e6, stateUpdatedAt: 50 })
    useStore.getState().applySync([])
    expect(useStore.getState().balance).toBe(13e6)
  })
})

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
