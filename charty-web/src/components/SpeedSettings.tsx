import { TF } from '../lib/data'
import { SPEED_PRESETS, sameCfg, type SpeedConfig } from '../lib/speed'
import type { Timeframe } from '../types'

const TFS: Timeframe[] = ['5m', '15m', '30m', '1h', '4h', '1d', '1w']
const INTRADAY: Timeframe[] = ['5m', '15m', '30m'] // 5분봉 원본이 최근 60일뿐 (15·30분은 거기서 리샘플)
const TPS = [null, 0.5, 1, 2, 3, 5, 10, 15, 20]
const SLS = [null, 0.5, 1, 2, 3, 5, 10]
const PERIODS = [10, 20, 40, 60]

const pct = (v: number | null) => (v == null ? '없음' : `${v}%`)

// 칩 줄 — CustomStyle의 .opt 칩처럼 padding 0 + 명시 높이 (전역 button 패딩이 좁은 칸을 넘친다)
function Chips({ title, cols, items }: { title: string; cols: number; items: { label: string; on: boolean; pick: () => void }[] }) {
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px', margin: '16px 0 8px' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
        {items.map((it) => (
          <button key={it.label} className={`opt${it.on ? ' selected' : ''}`} onClick={it.pick} style={{ height: 36, borderRadius: 10, fontSize: 13, padding: 0 }}>
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}

// 스피드 게임 설정 폼 — 첫 진입 카드와 ⚙ 시트가 함께 쓴다. 값은 전부 칩으로만 들어와 검증이 필요 없다
export default function SpeedSettings({ value, onChange }: { value: SpeedConfig; onChange: (c: SpeedConfig) => void }) {
  const set = (p: Partial<SpeedConfig>) => onChange({ ...value, ...p })
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px', marginBottom: 8 }}>빠른 조합</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {SPEED_PRESETS.map((p) => (
          <button
            key={p.label}
            className={`opt${sameCfg(p.cfg, value) ? ' selected' : ''}`}
            onClick={() => onChange(p.cfg)}
            style={{ height: 52, borderRadius: 12, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <b style={{ fontSize: 14 }}>{p.label}</b>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{TF[p.cfg.tf].label} · +{p.cfg.tpPct}% · −{p.cfg.slPct}%</span>
          </button>
        ))}
      </div>
      <Chips title="시간봉" cols={4} items={TFS.map((tf) => ({ label: TF[tf].label, on: value.tf === tf, pick: () => set({ tf }) }))} />
      {INTRADAY.includes(value.tf) && (
        <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>분봉은 최근 60일치뿐이라 비슷한 시기 차트가 자주 나와요</div>
      )}
      <Chips title="이익선" cols={5} items={TPS.map((v) => ({ label: pct(v), on: value.tpPct === v, pick: () => set({ tpPct: v }) }))} />
      <Chips title="손절선" cols={4} items={SLS.map((v) => ({ label: pct(v), on: value.slPct === v, pick: () => set({ slPct: v }) }))} />
      <Chips title="판정 캔들 수" cols={4} items={PERIODS.map((v) => ({ label: `${v}개`, on: value.period === v, pick: () => set({ period: v }) }))} />
    </div>
  )
}
