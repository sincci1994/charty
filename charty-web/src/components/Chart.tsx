import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../types'

export interface IndicatorShow {
  ema: boolean
  bol: boolean
  rsi: boolean
  vol: boolean
}

export interface PriceLineSpec {
  price: number
  up: boolean // true → --green, false → --red
  title: string // 라인 옆 텍스트 (포지션: PnL%, 주문: 수량)
}

interface Props {
  candles: Candle[]
  emas: { e1: (number | null)[]; e2: (number | null)[]; e3: (number | null)[] } // candles와 같은 인덱스
  bands: { upper: (number | null)[]; lower: (number | null)[] }
  rsi: (number | null)[]
  show: IndicatorShow
  lines: PriceLineSpec[]
}

export const EMA_COLORS = { e1: '#f5a623', e2: '#3d5cff', e3: '#9b2ff8' } as const
export const BOL_COLOR = 'rgba(92,168,255,0.55)'

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

interface SeriesMap {
  candle: ISeriesApi<'Candlestick'>
  volume?: ISeriesApi<'Histogram'>
  e1?: ISeriesApi<'Line'>
  e2?: ISeriesApi<'Line'>
  e3?: ISeriesApi<'Line'>
  bolUpper?: ISeriesApi<'Line'>
  bolLower?: ISeriesApi<'Line'>
  rsi?: ISeriesApi<'Line'>
}

export default function Chart({ candles, emas, bands, rsi, show, lines }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<SeriesMap | null>(null)
  const plRef = useRef<IPriceLine[]>([])
  const dataRef = useRef({ candles, emas, bands, rsi })
  dataRef.current = { candles, emas, bands, rsi }

  // 토글 변경 = 차트 재생성 (캔들 ~140개라 비용 무시 가능 — 시리즈 add/remove 상태 관리 생략)
  useEffect(() => {
    if (!ref.current) return
    // ponytail: 색상은 생성 시점의 CSS 변수 스냅샷 — 세션 중 라이트↔다크 전환은 토글/재진입 시 반영
    const green = cssVar('--green')
    const red = cssVar('--red')
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: cssVar('--bg') },
        textColor: cssVar('--dim'),
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: cssVar('--hairline') },
        horzLines: { color: cssVar('--hairline') },
      },
      timeScale: { timeVisible: true, borderColor: cssVar('--hairline') },
      rightPriceScale: { borderColor: cssVar('--hairline') },
      autoSize: true,
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: green,
      downColor: red,
      borderVisible: false,
      wickUpColor: green,
      wickDownColor: red,
    })
    const line = (color: string, width: 1 | 2 = 1) =>
      chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false })
    const s: SeriesMap = { candle }
    if (show.vol) {
      s.volume = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' } })
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    }
    if (show.ema) {
      s.e1 = line(EMA_COLORS.e1)
      s.e2 = line(EMA_COLORS.e2)
      s.e3 = line(EMA_COLORS.e3)
    }
    if (show.bol) {
      s.bolUpper = line(BOL_COLOR)
      s.bolLower = line(BOL_COLOR)
    }
    if (show.rsi) {
      // v5 네이티브 pane — paneIndex 1이 자동 생성됨
      s.rsi = chart.addSeries(LineSeries, { color: EMA_COLORS.e3, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 1)
      chart.panes()[1]?.setHeight(80)
    }
    seriesRef.current = s
    chartRef.current = chart
    plRef.current = [] // 구 차트의 라인 핸들은 chart.remove()로 이미 소멸
    setData(s, dataRef.current)
    chart.timeScale().scrollToRealTime()
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [show.ema, show.bol, show.rsi, show.vol])

  useEffect(() => {
    const s = seriesRef.current
    if (!s) return
    setData(s, { candles, emas, bands, rsi })
    chartRef.current?.timeScale().scrollToRealTime()
  }, [candles, emas, bands, rsi])

  // 포지션/미체결 주문 점선 — 차트 재생성 후에도 다시 그리도록 show도 deps에 포함
  useEffect(() => {
    const s = seriesRef.current
    if (!s) return
    plRef.current.forEach((l) => s.candle.removePriceLine(l))
    plRef.current = lines.map((l) =>
      s.candle.createPriceLine({
        price: l.price,
        color: cssVar(l.up ? '--green' : '--red'),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.title,
      }),
    )
  }, [lines, show.ema, show.bol, show.rsi, show.vol])

  return <div ref={ref} style={{ width: '100%', height: 320 }} />
}

function setData(s: SeriesMap, d: { candles: Candle[]; emas: Props['emas']; bands: Props['bands']; rsi: Props['rsi'] }) {
  const { candles, emas, bands, rsi } = d
  const green = cssVar('--green')
  const red = cssVar('--red')
  s.candle.setData(
    candles.map((c) => ({ time: c.ts as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c })),
  )
  s.volume?.setData(
    candles.map((c) => ({ time: c.ts as UTCTimestamp, value: c.v, color: c.c >= c.o ? `${green}66` : `${red}66` })),
  )
  const lineData = (vals: (number | null)[]) =>
    candles
      .map((c, i) => ({ time: c.ts as UTCTimestamp, value: vals[i] }))
      .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null)
  s.e1?.setData(lineData(emas.e1))
  s.e2?.setData(lineData(emas.e2))
  s.e3?.setData(lineData(emas.e3))
  s.bolUpper?.setData(lineData(bands.upper))
  s.bolLower?.setData(lineData(bands.lower))
  s.rsi?.setData(lineData(rsi))
}
