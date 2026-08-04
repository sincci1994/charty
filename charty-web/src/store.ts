import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActiveSim, Candle, CustomStyle, Side, SimRecord, Style } from './types'
import { STYLES, barsFor, loadCandles, loadTickers, pickRange } from './lib/data'
import { equity, fillOrders, forceCloseAll, validateOrder } from './lib/engine'

interface State {
  balance: number
  activeSim: ActiveSim | null
  records: SimRecord[]
  customs: CustomStyle[]
  candles: Candle[] // 활성 시뮬의 전체 캔들 (localStorage에 저장 안 함)
  theme: 'light' | 'dark' | null // null = 시스템 설정 따름
  setTheme: (t: 'light' | 'dark') => void

  startSim: (style: string) => Promise<void>
  saveCustom: (c: CustomStyle) => void
  deleteCustom: (id: string) => void
  resume: () => Promise<void>
  nextCandle: () => void
  placeOrder: (side: Side, price: number, qty: number, reasons?: string[]) => string | null
  cancelOrder: (id: string) => void
  endNow: () => void
  discardSim: () => void
  submitReview: (emotion: string, memo: string) => void
  resetAll: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      balance: 1_000_000,
      activeSim: null,
      records: [],
      customs: [],
      candles: [],
      theme: null,
      setTheme: (theme) => set({ theme }),

      startSim: async (style) => {
        const preset = STYLES[style as Style]
        const custom = get().customs.find((c) => c.id === style)
        if (!preset && !custom) throw new Error('스타일을 찾을 수 없습니다')
        const cfg = preset ?? { label: custom!.name, tf: custom!.tf, bars: barsFor(custom!) }
        const tickers = await loadTickers()
        const symbol = tickers[Math.floor(Math.random() * tickers.length)]
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
        fillOrders(sim, candles[sim.cursor])
        if (sim.cursor >= sim.endIndex) forceCloseAll(sim, candles[sim.cursor])
        set({ activeSim: sim })
      },

      placeOrder: (side, price, qty, reasons) => {
        const { activeSim } = get()
        if (!activeSim || activeSim.done) return '진행중인 시뮬레이션이 없습니다'
        const err = validateOrder(activeSim, side, price, qty)
        if (err) return err
        const sim = structuredClone(activeSim)
        sim.openOrders.push({ id: crypto.randomUUID(), side, price, qty, reasons })
        set({ activeSim: sim })
        return null
      },

      cancelOrder: (id) => {
        const { activeSim } = get()
        if (!activeSim) return
        const sim = structuredClone(activeSim)
        sim.openOrders = sim.openOrders.filter((o) => o.id !== id)
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
        const { activeSim, records } = get()
        if (!activeSim || !activeSim.done) return
        const record: SimRecord = {
          id: activeSim.id,
          endedAt: Date.now(),
          style: activeSim.style,
          styleLabel: activeSim.styleLabel,
          symbol: activeSim.symbol,
          startBalance: activeSim.startBalance,
          endBalance: activeSim.cash,
          pnlPct: ((activeSim.cash - activeSim.startBalance) / activeSim.startBalance) * 100,
          tradeCount: activeSim.trades.length,
          emotion,
          memo,
        }
        set({ balance: activeSim.cash, records: [record, ...records], activeSim: null, candles: [] })
      },

      resetAll: () => set({ balance: 1_000_000, activeSim: null, records: [], candles: [] }),
    }),
    {
      name: 'charty',
      partialize: (s) => ({ balance: s.balance, activeSim: s.activeSim, records: s.records, customs: s.customs, theme: s.theme }),
    },
  ),
)

// 현재 시점 총자산 (선택자 헬퍼)
export function currentEquity(sim: ActiveSim, candles: Candle[]): number {
  const price = candles[sim.cursor]?.c ?? 0
  return equity(sim, price)
}

// 시뮬레이션 진행률 % (0~100)
export function simProgress(sim: ActiveSim): number {
  return Math.round(((sim.cursor - sim.startIndex) / (sim.endIndex - sim.startIndex)) * 100)
}
