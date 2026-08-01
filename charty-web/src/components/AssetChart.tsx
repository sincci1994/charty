const W = 320
const H = 110
const PAD = 8

export function toLinePath(values: number[]): { line: string; area: string; end: [number, number] } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 0.02)
  const xy = values.map((v, i): [number, number] => [
    (i / (values.length - 1)) * (W - 10) + 4,
    PAD + (1 - (v - min) / range) * (H - PAD * 2),
  ])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`
  return { line, area, end: xy[xy.length - 1] }
}

if (import.meta.env.DEV) {
  // 최소→최대 2점: 시작은 바닥, 끝은 천장
  const { line, end } = toLinePath([0, 100])
  console.assert(line === `M4.0 ${H - PAD}.0 L${W - 6}.0 ${PAD}.0`, 'toLinePath broken:', line)
  console.assert(end[0] === W - 6 && end[1] === PAD, 'toLinePath end broken:', end)
}

export default function AssetChart({ values, startLabel }: { values: number[]; startLabel: string }) {
  const { line, area, end } = toLinePath(values)
  return (
    <>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', marginTop: 10 }}>
        <defs>
          <linearGradient id="chartStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1FB6FF" />
            <stop offset="55%" stopColor="#3D5CFF" />
            <stop offset="100%" stopColor="#9B2FF8" />
          </linearGradient>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3D5CFF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3D5CFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#chartFill)" />
        <path d={line} fill="none" stroke="url(#chartStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={end[0]} cy={end[1]} r="4" fill="#9B2FF8" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="sub" style={{ fontSize: 10 }}>{startLabel}</span>
        <span className="sub" style={{ fontSize: 10 }}>현재</span>
      </div>
    </>
  )
}
