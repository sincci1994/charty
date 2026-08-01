import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../types'

interface Props {
  candles: Candle[]
  emas: { e13: (number | null)[]; e25: (number | null)[]; e200: (number | null)[] } // candles와 같은 인덱스
}

const EMA_COLORS = { e13: '#f0b90b', e25: '#e056fd', e200: '#546de5' } as const

export default function Chart({ candles, emas }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<{
    candle: ISeriesApi<'Candlestick'>
    volume: ISeriesApi<'Histogram'>
    e13: ISeriesApi<'Line'>
    e25: ISeriesApi<'Line'>
    e200: ISeriesApi<'Line'>
  } | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#8e8e93',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1c1c1e' },
        horzLines: { color: '#1c1c1e' },
      },
      timeScale: { timeVisible: true, borderColor: '#2c2c2e' },
      rightPriceScale: { borderColor: '#2c2c2e' },
      autoSize: true,
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#30d158',
      downColor: '#ff453a',
      borderVisible: false,
      wickUpColor: '#30d158',
      wickDownColor: '#ff453a',
    })
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    const line = (color: string) =>
      chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    seriesRef.current = {
      candle,
      volume,
      e13: line(EMA_COLORS.e13),
      e25: line(EMA_COLORS.e25),
      e200: line(EMA_COLORS.e200),
    }
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const s = seriesRef.current
    if (!s) return
    s.candle.setData(
      candles.map((c) => ({ time: c.ts as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c })),
    )
    s.volume.setData(
      candles.map((c) => ({
        time: c.ts as UTCTimestamp,
        value: c.v,
        color: c.c >= c.o ? 'rgba(48,209,88,0.4)' : 'rgba(255,69,58,0.4)',
      })),
    )
    for (const key of ['e13', 'e25', 'e200'] as const) {
      s[key].setData(
        candles
          .map((c, i) => ({ time: c.ts as UTCTimestamp, value: emas[key][i] }))
          .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
      )
    }
    chartRef.current?.timeScale().scrollToRealTime()
  }, [candles, emas])

  return <div ref={ref} style={{ width: '100%', height: 320 }} />
}
