import { STYLES } from '../lib/data'
import { useStore } from '../store'

export default function History() {
  const records = useStore((s) => s.records)

  if (records.length === 0)
    return (
      <div className="page">
        <h2>기록</h2>
        <div className="empty">아직 완료한 연습이 없어요.<br />연습 탭에서 첫 시뮬레이션을 시작해보세요!</div>
      </div>
    )

  return (
    <div className="page">
      <h2>기록</h2>
      {records.map((r) => (
        <details key={r.id} className="card record">
          <summary>
            <span>
              <b>{r.symbol}</b> <span className="dim small">{STYLES[r.style].label} · {new Date(r.endedAt).toLocaleDateString()}</span>
            </span>
            <b className={r.pnlPct >= 0 ? 'green' : 'red'}>
              {r.pnlPct >= 0 ? '+' : ''}{r.pnlPct.toFixed(2)}%
            </b>
          </summary>
          <div className="record-body">
            <div className="dim small">
              {r.startBalance.toLocaleString()} → {r.endBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {' · '}거래 {r.tradeCount}회 · 감정 {r.emotion}
            </div>
            {r.memo && <p className="memo">{r.memo}</p>}
          </div>
        </details>
      ))}
    </div>
  )
}
