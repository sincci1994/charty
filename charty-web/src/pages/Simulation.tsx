import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Chart from '../components/Chart'
import OrderPanel from '../components/OrderPanel'
import { currentEquity, useStore } from '../store'
import { LOOKBACK, STYLES, ema } from '../lib/data'

function progressText(pct: number, done: boolean) {
  if (done) return '연습 완료! 회고를 작성해보세요'
  if (pct >= 99) return '마지막 캔들입니다'
  if (pct >= 80) return '거의 다 왔어요!'
  return '차트 분석을 계속해보세요'
}

export default function Simulation() {
  const nav = useNavigate()
  const { activeSim: sim, candles, nextCandle, endNow, resume } = useStore()

  useEffect(() => {
    if (!sim) nav('/practice', { replace: true })
    else resume()
  }, [sim, nav, resume])

  const emas = useMemo(() => {
    const closes = candles.map((c) => c.c)
    return { e13: ema(closes, 13), e25: ema(closes, 25), e200: ema(closes, 200) }
  }, [candles])

  const visible = useMemo(() => {
    if (!sim) return { candles: [], emas: { e13: [], e25: [], e200: [] } }
    const from = Math.max(0, sim.startIndex - LOOKBACK)
    const to = sim.cursor + 1
    return {
      candles: candles.slice(from, to),
      emas: { e13: emas.e13.slice(from, to), e25: emas.e25.slice(from, to), e200: emas.e200.slice(from, to) },
    }
  }, [sim, candles, emas])

  if (!sim || candles.length === 0) return <div className="page"><div className="empty">불러오는 중…</div></div>

  const total = sim.endIndex - sim.startIndex
  const pct = total > 0 ? ((sim.cursor - sim.startIndex) / total) * 100 : 100
  const price = candles[sim.cursor].c
  const eq = currentEquity(sim, candles)
  const pnl = eq - sim.startBalance
  const pnlPct = (pnl / sim.startBalance) * 100

  return (
    <div className="page">
      <div className="sim-header">
        <div>
          <b>{sim.symbol}</b> <span className="dim">{STYLES[sim.style].label} · {sim.timeframe}</span>
        </div>
        {!sim.done && (
          <button
            className="ghost-btn"
            onClick={() => { if (confirm('지금 종료할까요? 남은 포지션은 종가로 청산됩니다.')) endNow() }}
          >
            지금 종료
          </button>
        )}
      </div>

      <div className="progress-wrap">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <div className="dim small">{progressText(pct, sim.done)} ({Math.round(pct)}%)</div>
      </div>

      <Chart candles={visible.candles} emas={visible.emas} />

      <div className="asset-row">
        <div><span className="dim small">총자산</span><br /><b>{eq.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>
        <div><span className="dim small">현금</span><br />{sim.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <div className={pnl >= 0 ? 'green' : 'red'}>
          <span className="dim small">손익</span><br />
          {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pnlPct.toFixed(2)}%)
        </div>
      </div>

      {sim.done ? (
        <button className="primary-btn big pulse" onClick={() => nav('/review')}>회고 작성하기</button>
      ) : (
        <button className="primary-btn big" onClick={nextCandle}>다음 캔들 ▶</button>
      )}

      {!sim.done && <OrderPanel sim={sim} currentPrice={price} />}
    </div>
  )
}
