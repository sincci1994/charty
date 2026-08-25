import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActiveSim, Candle, CustomStyle, Side, SimRecord, Style } from './types'
import { EMA_WARMUP, LOOKBACK, SETS, START_BALANCE, STYLES, barsFor, loadCandleCounts, loadCandles, loadTickers, pickRange } from './lib/data'
import type { SetKey } from './lib/data'
import { fillOrders, forceCloseAll, validateOrder } from './lib/engine'
import { cancelPush, clearRemote, pushRecord } from './lib/sync'
import type { SyncedState } from './lib/sync'

// R5 주문 판단 기록 — reasons 필수(UI에서 강제), sl/tp 선택, ms=시트 열림→제출 소요시간(R6)
export interface Judgment {
  reasons: string[]
  note?: string
  sl?: number
  tp?: number
  ms?: number
}

interface State {
  balance: number
  activeSim: ActiveSim | null
  records: SimRecord[]
  customs: CustomStyle[]
  candles: Candle[] // 활성 시뮬의 전체 캔들 (localStorage에 저장 안 함)
  theme: 'light' | 'dark' | 'charty' | null // null = 시스템 설정 따름, charty = 브랜드 남색 그라데이션
  coach: boolean // R16 — 뉴스·재무 탭 도우미 해석 카드 (기기 로컬 설정)
  waitlistAt: number | null // R7 지불의사 게이트 — '미리 신청하기' 클릭 시각. 리포트 미출시로 CTA 제거(2026-08-26), 현재 미수집 · 과거 기록만 보존
  welcomed: boolean // R12 — 첫 방문 웰컴 화면을 지나쳤는가 (기록 있는 기존 유저는 게이트가 자동 통과)
  stateUpdatedAt: number // R13 — 동기화 슬라이스(SyncedState)의 마지막 변이 시각, 기기 간 LWW 비교 기준
  syncError: boolean // R13 — 마지막 pull 실패 여부 (비영속, More 문구용)
  setTheme: (t: 'light' | 'dark' | 'charty') => void
  setCoach: (v: boolean) => void
  setWelcomed: () => void

  startSim: (style: string, setKey?: SetKey) => Promise<void>
  saveCustom: (c: CustomStyle) => void
  deleteCustom: (id: string) => void
  resume: () => Promise<void>
  nextCandle: () => void
  placeOrder: (side: Side, price: number, qty: number, j?: Judgment) => string | null
  cancelOrder: (id: string) => void
  setRisk: (kind: 'sl' | 'tp', value: number) => void
  logNewsView: () => void
  logFundView: () => void
  endNow: () => void
  discardSim: () => void
  submitReview: (emotion: string, memo: string) => void
  applySync: (records: SimRecord[]) => void
  applyState: (data: SyncedState, updatedAt: number) => void
  setSyncError: (v: boolean) => void
  wipeLocal: () => void
  resetAll: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      balance: START_BALANCE,
      activeSim: null,
      records: [],
      customs: [],
      candles: [],
      theme: null,
      coach: true,
      waitlistAt: null,
      welcomed: false,
      stateUpdatedAt: 0,
      syncError: false,
      setTheme: (theme) => set({ theme }),
      setCoach: (coach) => set({ coach }),
      setWelcomed: () => set({ welcomed: true }),

      startSim: async (style, setKey) => {
        const preset = STYLES[style as Style]
        const custom = get().customs.find((c) => c.id === style)
        if (!preset && !custom) throw new Error('스타일을 찾을 수 없습니다')
        const cfg = preset ?? { label: custom!.name, tf: custom!.tf, bars: barsFor(custom!) }
        const tickers = await loadTickers()
        // R14 세트 제한(블라인드 유지 — 세트 내 무작위) + 선택한 기간을 감당할 캔들이 있는 종목만.
        // counts 로드 실패 시 세트 풀 전체 폴백 — pickRange의 throw가 최종 가드
        const setTickers = setKey ? SETS[setKey]?.tickers : null
        const pool = setTickers ? tickers.filter((t) => setTickers.includes(t)) : tickers
        const counts = await loadCandleCounts().catch(() => null)
        const need = cfg.bars + EMA_WARMUP + LOOKBACK
        const eligible = counts ? pool.filter((t) => (counts[t]?.[cfg.tf] ?? 0) >= need) : pool
        if (eligible.length === 0)
          throw new Error(setTickers ? '이 세트에는 이 기간을 감당할 종목 데이터가 없어요. 다른 세트나 더 짧은 기간을 골라주세요' : '이 기간을 감당할 종목 데이터가 없습니다')
        const symbol = eligible[Math.floor(Math.random() * eligible.length)]
        const candles = await loadCandles(symbol, cfg.tf)
        const { startIndex, endIndex } = pickRange(candles.length, cfg.bars)
        set({
          candles,
          activeSim: {
            id: crypto.randomUUID(),
            style,
            styleLabel: cfg.label,
            symbol,
            timeframe: cfg.tf,
            startIndex,
            endIndex,
            cursor: startIndex,
            startBalance: get().balance,
            cash: get().balance,
            positions: {},
            openOrders: [],
            trades: [],
            done: false,
          },
        })
      },

      saveCustom: (c) => {
        const customs = get().customs
        const i = customs.findIndex((x) => x.id === c.id)
        set({ customs: i >= 0 ? customs.map((x) => (x.id === c.id ? c : x)) : [...customs, c] })
      },

      deleteCustom: (id) => set({ customs: get().customs.filter((c) => c.id !== id) }),

      // 새로고침 후 진행중 시뮬의 캔들 다시 로드
      resume: async () => {
        const sim = get().activeSim
        if (!sim || get().candles.length > 0) return
        set({ candles: await loadCandles(sim.symbol, sim.timeframe) })
      },

      nextCandle: () => {
        const { activeSim, candles } = get()
        if (!activeSim || activeSim.done || candles.length === 0) return
        const sim = structuredClone(activeSim)
        sim.cursor += 1
        const candle = candles[sim.cursor]
        fillOrders(sim, candle)
        // 손절 계획가 도달 감지 (R6) — sl 값당 1회만 기록, 실행 여부 판단은 리포트에서
        const pos = sim.positions.LONG
        if (pos?.sl != null && !pos.slHit && candle.l <= pos.sl) {
          pos.slHit = true
          ;(sim.events ??= []).push({ ts: candle.ts, k: 'slhit', v: pos.sl })
        }
        if (sim.cursor >= sim.endIndex) forceCloseAll(sim, candle)
        set({ activeSim: sim })
      },

      placeOrder: (side, price, qty, j) => {
        const { activeSim, candles } = get()
        if (!activeSim || activeSim.done) return '진행중인 시뮬레이션이 없습니다'
        const err = validateOrder(activeSim, side, price, qty)
        if (err) return err
        const sim = structuredClone(activeSim)
        sim.openOrders.push({ id: crypto.randomUUID(), side, price, qty, reasons: j?.reasons, note: j?.note, sl: j?.sl, tp: j?.tp })
        ;(sim.events ??= []).push({ ts: candles[sim.cursor]?.ts ?? 0, k: 'order', ms: j?.ms })
        set({ activeSim: sim })
        return null
      },

      cancelOrder: (id) => {
        const { activeSim, candles } = get()
        if (!activeSim) return
        const sim = structuredClone(activeSim)
        sim.openOrders = sim.openOrders.filter((o) => o.id !== id)
        ;(sim.events ??= []).push({ ts: candles[sim.cursor]?.ts ?? 0, k: 'cancel' })
        set({ activeSim: sim })
      },

      // 보유 중 손절·목표 계획 수정 (R6) — 기록만 하고 판단하지 않는다 (경고·확인 없음)
      setRisk: (kind, value) => {
        const { activeSim, candles } = get()
        if (!activeSim || activeSim.done) return
        if (!activeSim.positions.LONG || activeSim.positions.LONG[kind] === value) return // 무변경 저장은 이벤트 아님
        const sim = structuredClone(activeSim)
        const pos = sim.positions.LONG!
        ;(sim.events ??= []).push({ ts: candles[sim.cursor]?.ts ?? 0, k: kind, old: pos[kind] ?? null, v: value })
        pos[kind] = value
        if (kind === 'sl') pos.slHit = false
        set({ activeSim: sim })
      },

      logNewsView: () => {
        const { activeSim, candles } = get()
        if (!activeSim || activeSim.done) return
        const sim = structuredClone(activeSim)
        ;(sim.events ??= []).push({ ts: candles[sim.cursor]?.ts ?? 0, k: 'news' })
        set({ activeSim: sim })
      },

      logFundView: () => {
        const { activeSim, candles } = get()
        if (!activeSim || activeSim.done) return
        const sim = structuredClone(activeSim)
        ;(sim.events ??= []).push({ ts: candles[sim.cursor]?.ts ?? 0, k: 'fund' })
        set({ activeSim: sim })
      },


      endNow: () => {
        const { activeSim, candles } = get()
        if (!activeSim || activeSim.done) return
        const sim = structuredClone(activeSim)
        forceCloseAll(sim, candles[sim.cursor])
        set({ activeSim: sim })
      },

      // 진행중 시뮬을 기록 없이 폐기 (홈 '새로 시작') — 잔고는 시뮬 시작 전 그대로
      discardSim: () => set({ activeSim: null, candles: [] }),

      submitReview: (emotion, memo) => {
        const { activeSim, candles, records } = get()
        if (!activeSim || !activeSim.done) return
        const record: SimRecord = {
          id: activeSim.id,
          endedAt: Date.now(),
          style: activeSim.style,
          styleLabel: activeSim.styleLabel,
          timeframe: activeSim.timeframe,
          symbol: activeSim.symbol,
          startBalance: activeSim.startBalance,
          endBalance: activeSim.cash,
          pnlPct: ((activeSim.cash - activeSim.startBalance) / activeSim.startBalance) * 100,
          tradeCount: activeSim.trades.length,
          emotion,
          memo,
          trades: activeSim.trades,
          events: activeSim.events,
          // R13 누적 차트시간 — 실제 플레이한 구간만 (조기 종료 시 미진행 잔여 미포함).
          // ts 둘은 /review 직접 새로고침(candles 미로드) 시 undefined로 남을 수 있음 — 집계에서 제외됨
          elapsedBars: activeSim.cursor - activeSim.startIndex,
          early: activeSim.cursor < activeSim.endIndex,
          startTs: candles[activeSim.startIndex]?.ts,
          endTs: candles[activeSim.cursor]?.ts,
        }
        set({ balance: activeSim.cash, records: [record, ...records], activeSim: null, candles: [] })
        void pushRecord(record) // R11 — 로그인 상태면 서버에도 저장 (실패는 다음 대사가 수습)
      },

      // R11 서버 대사 결과 반영 — 병합본으로 교체, 잔고는 최신 기록의 종료 잔고를 따름
      // (state 행이 아직 없는 기존 유저의 복원 경로 — state pull이 있으면 뒤이어 applyState가 덮어씀)
      applySync: (records) => set({ records, balance: records[0]?.endBalance ?? get().balance }),

      // R13 서버 state 반영 — 호출부(shell)가 updatedAt 비교 후 서버가 더 새로울 때만 applyServer로 호출.
      // sim이 교체되면 candles도 비움 — 안 비우면 resume()이 이전 종목 캔들을 재사용해 오표시·크래시
      applyState: (data, updatedAt) =>
        set({ ...data, stateUpdatedAt: updatedAt, ...(data.activeSim?.id !== get().activeSim?.id ? { candles: [] } : {}) }),
      setSyncError: (syncError) => set({ syncError }),

      // 로그아웃·계정 전환 — 이 기기의 '계정 데이터'만 비운다. 서버는 안 건드림(재로그인 때 복구된다).
      // theme·coach는 기기 로컬 설정이라 유지 — 로그아웃했다고 다크모드가 풀리면 그건 버그다.
      // persist는 set()마다 동기 기록이라 localStorage 'charty'가 이 set() 직후 리셋 블롭으로 덮인다 (removeItem 불필요)
      wipeLocal: () => {
        cancelPush() // 예약된 디바운스 push 취소 — 빈 슬라이스가 올라가면 customs·activeSim은 state 행이 유일본이라 소실
        set({
          balance: START_BALANCE, activeSim: null, records: [], customs: [], candles: [],
          waitlistAt: null, welcomed: false, stateUpdatedAt: 0, syncError: false,
        })
      },

      resetAll: () => {
        void clearRemote() // R11 — 서버 기록도 삭제 (안 지우면 다음 로그인 때 부활)
        set({ balance: START_BALANCE, activeSim: null, records: [], candles: [] })
      },
    }),
    {
      name: 'charty',
      version: 2,
      partialize: (s) => ({ balance: s.balance, activeSim: s.activeSim, records: s.records, customs: s.customs, theme: s.theme, coach: s.coach, waitlistAt: s.waitlistAt, welcomed: s.welcomed, stateUpdatedAt: s.stateUpdatedAt }),
      // v1 현물 전환: SHORT 포지션·주문이 남은 진행 세션은 UI로 다룰 수 없으므로 폐기 (기록·잔고는 유지)
      // v2 통화 정합(FX): 구스케일($축 현금)로 진행 중이던 세션은 평가액이 어긋나므로 폐기 (기록·잔고는 유지)
      migrate: (persisted, version) => {
        const s = persisted as { activeSim?: ActiveSim | null }
        if (s.activeSim && (s.activeSim.positions?.SHORT || s.activeSim.openOrders?.some((o) => o.side.includes('SHORT'))))
          s.activeSim = null
        if (version < 2 && s.activeSim) s.activeSim = null
        return persisted
      },
    },
  ),
)

// 시뮬레이션 진행률 % (0~100)
export function simProgress(sim: ActiveSim): number {
  const total = sim.endIndex - sim.startIndex
  return total ? Math.round(((sim.cursor - sim.startIndex) / total) * 100) : 100
}
