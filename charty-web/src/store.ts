import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActiveSim, Candle, Side, SimRecord, Style } from './types'
import { STYLES, loadCandles, loadTickers, pickRange } from './lib/data'
import { equity, fillOrders, forceCloseAll, validateOrder } from './lib/engine'

interface State {
  balance: number
  activeSim: ActiveSim | null
  records: SimRecord[]
  candles: Candle[] // 활성 시뮬의 전체 캔들 (localStorage에 저장 안 함)

  startSim: (style: Style) => Promise<void>
  resume: () => Promise<void>
  nextCandle: () => void
  placeOrder: (side: Side, price: number, qty: number) => string | null
  cancelOrder: (id: string) => void
  endNow: () => void
  submitReview: (emotion: string, memo: string) => void
  resetAll: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      balance: 1_000_000,
      activeSim: null,
      records: [],
      candles: [],

      startSim: async (style) => {
        const cfg = STYLES[style]
        const tickers = await loadTickers()
        const symbol = tickers[Math.floor(Math.random() * tickers.length)]
        const candles = await loadCandles(symbol, cfg.tf)
        const { startIndex, endIndex } = pickRange(candles.length, cfg.bars)
        set({
          candles,
          activeSim: {
            id: crypto.randomUUID(),
            style,
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

      placeOrder: (side, price, qty) => {
        const { activeSim } = get()
        if (!activeSim || activeSim.done) return '진행중인 시뮬레이션이 없습니다'
        const err = validateOrder(activeSim, side, price, qty)
        if (err) return err
        const sim = structuredClone(activeSim)
        sim.openOrders.push({ id: crypto.randomUUID(), side, price, qty })
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

      submitReview: (emotion, memo) => {
        const { activeSim, records } = get()
        if (!activeSim || !activeSim.done) return
        const record: SimRecord = {
          id: activeSim.id,
          endedAt: Date.now(),
          style: activeSim.style,
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
      partialize: (s) => ({ balance: s.balance, activeSim: s.activeSim, records: s.records }),
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
