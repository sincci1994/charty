import { fmtW, tierProgress } from '../lib/data'

// 부 단계 이름 + 다음 단계까지 게이지 — 홈 자산 카드·스피드 화면 공용. 그림이 바뀌기 전에도 판마다 성장이 보이게.
// hideAmount: 홈의 자산 숨기기가 켜지면 '남은 금액'으로 잔고가 새지 않게 단계 이름만 보여준다
export default function WealthGauge({ asset, hideAmount }: { asset: number; hideAmount?: boolean }) {
  const { i, cur, next, pct } = tierProgress(asset)
  return (
    <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{cur.label}</b>
        <span className="dim" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {!next ? '최고 단계예요' : hideAmount ? `다음 단계 ${next.label}` : `${next.label}까지 ${fmtW(next.min - asset)}`}
        </span>
      </div>
      {/* key=단계 — 단계가 바뀌면 바를 새로 그려 .track의 폭 전환이 95%→5%로 거꾸로 줄어드는 모습을 막는다 */}
      <div className="track" key={i} style={{ height: 5, marginTop: 0 }}>
        <div style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}
