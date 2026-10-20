import type { Candle } from '../types'
import type { PriceLineSpec } from './Chart'

const W = 320
const H = 260 // 폰 세로 화면의 빈 공간을 쓰도록 4:3보다 약간 높게 (QA 2026-10-20)
export const ASPECT = `${W} / ${H}` // 로딩 자리표시가 같은 높이를 잡도록

// 스피드 게임 전용 SVG 캔들 — Chart.tsx(lightweight-charts)를 안 쓰는 이유:
// 데이터 변경마다 scrollToRealTime이 돌아 공개 중 차트가 미끄러지고, 가격선이 자동 스케일 밖으로 나가며,
// $ 가격축(분할 조정가)·십자선 시각(일봉 04/05시 UTC = 서머타임)이 종목·시대를 흘린다.
// 여기선 축이 없고 x는 고정 슬롯이라 공개 캔들이 제자리에 채워진다.
// y범위 = 받은 캔들 + 선 가격뿐 — 미공개 캔들은 props로 안 오므로 스케일로 미래가 새지 않는다
export default function SpeedChart({ candles, slots, split, lines, extent = [] }: {
  candles: Candle[] // 공개된 만큼만
  slots: number // 전체 칸 수 (과거 + 판정 기간)
  split: number // 미래 구간이 시작하는 칸
  lines: PriceLineSpec[]
  extent?: number[] // 그리지 않고 y범위에만 넣을 가격 — 선을 지워도 스케일이 다시 잡히지 않게
}) {
  const ps = [...candles.flatMap((c) => [c.h, c.l]), ...lines.map((l) => l.price), ...extent]
  const hi = Math.max(...ps)
  const lo = Math.min(...ps)
  const pad = (hi - lo) * 0.08 // 진입±TP 선이 늘 있어 범위 > 0
  const y = (p: number) => ((hi + pad - p) / (hi - lo + 2 * pad)) * H
  const bw = W / slots
  return (
    <svg className="speed-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="차트">
      <rect className="sc-zone" x={split * bw} width={W - split * bw} height={H} />
      {lines.map((l) => (
        <g key={l.title} style={{ color: `var(--${l.color})` }}>
          <line x1={0} x2={W} y1={y(l.price)} y2={y(l.price)} stroke="currentColor" strokeWidth={0.8} strokeDasharray="4 3" />
          <text x={W - 3} y={y(l.price) - 3} fontSize={9} textAnchor="end" fill="currentColor">{l.title}</text>
        </g>
      ))}
      {/* 인덱스 키 — 한 판 안에서 배열은 늘기만 해서 새로 공개된 캔들만 마운트돼 .sc-pop이 한 번씩만 돈다 */}
      {candles.map((c, i) => {
        const x = (i + 0.5) * bw
        const top = y(Math.max(c.o, c.c))
        return (
          <g key={i} className={i >= split ? 'sc-pop' : undefined} style={{ color: `var(--${c.c >= c.o ? 'green' : 'red'})` }}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke="currentColor" strokeWidth={0.8} />
            <rect x={x - bw * 0.35} y={top} width={bw * 0.7} height={Math.max(0.8, y(Math.min(c.o, c.c)) - top)} fill="currentColor" />
          </g>
        )
      })}
    </svg>
  )
}
