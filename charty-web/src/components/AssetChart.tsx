const W = 320
const H = 110
const PAD = 8

// SVG 폴리라인 path + 끝점 좌표 — NewsPanel 미니차트들과 공유
export function polyline(vals: number[], w: number, h: number, mn: number, mx: number, p = 5) {
  const x = (i: number) => p + (i / (vals.length - 1)) * (w - 2 * p)
  const y = (v: number) => p + (1 - (v - mn) / (mx - mn || 1)) * (h - 2 * p)
  return {
    d: vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' '),
    lx: x(vals.length - 1),
    ly: y(vals[vals.length - 1]),
  }
}

export default function AssetChart({ values, startLabel }: { values: number[]; startLabel: string }) {
  const { d, lx, ly } = polyline(values, W, H, Math.min(...values), Math.max(...values), PAD)
  const area = `${d} L${lx.toFixed(1)} ${H} L${PAD} ${H} Z`
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
        <path d={d} fill="none" stroke="url(#chartStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="4" fill="#9B2FF8" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="sub" style={{ fontSize: 10 }}>{startLabel}</span>
        <span className="sub" style={{ fontSize: 10 }}>현재</span>
      </div>
    </>
  )
}
