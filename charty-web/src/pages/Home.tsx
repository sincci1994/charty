import { useNavigate } from 'react-router-dom'
import { STYLES } from '../lib/data'
import { useStore } from '../store'

export default function Home() {
  const nav = useNavigate()
  const { balance, records, activeSim } = useStore()

  const wins = records.filter((r) => r.pnlPct > 0).length
  const winRate = records.length ? (wins / records.length) * 100 : null
  const avgPnl = records.length ? records.reduce((s, r) => s + r.pnlPct, 0) / records.length : null

  return (
    <div className="page">
      <h2>차티 📈</h2>
      <p className="dim">과거 차트로 훈련하는 모의투자</p>

      <div className="card center">
        <div className="dim small">내 자산</div>
        <div className="big-number">{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      </div>

      <div className="stat-row">
        <div className="card center stat">
          <div className="dim small">연습 횟수</div>
          <b>{records.length}회</b>
        </div>
        <div className="card center stat">
          <div className="dim small">승률</div>
          <b>{winRate === null ? '-' : `${winRate.toFixed(0)}%`}</b>
        </div>
        <div className="card center stat">
          <div className="dim small">평균 수익률</div>
          <b className={avgPnl !== null && avgPnl < 0 ? 'red' : 'green'}>
            {avgPnl === null ? '-' : `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`}
          </b>
        </div>
      </div>

      {activeSim ? (
        <button className="primary-btn big" onClick={() => nav('/sim')}>
          진행중인 연습 이어하기 ▶ <span className="small">({activeSim.symbol} · {STYLES[activeSim.style].label})</span>
        </button>
      ) : (
        <button className="primary-btn big" onClick={() => nav('/practice')}>새 연습 시작하기</button>
      )}
    </div>
  )
}
