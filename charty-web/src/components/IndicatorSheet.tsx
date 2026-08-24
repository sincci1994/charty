import { useEffect, useRef } from 'react'
import { EMA_COLORS, type IndicatorShow } from './Chart'

export interface IndCfg {
  e1: number
  e2: number
  e3: number
  bolP: number
  bolK: number
  rsiP: number
}

export const DEFAULT_CFG: IndCfg = { e1: 13, e2: 25, e3: 200, bolP: 20, bolK: 2, rsiP: 14 }

interface ParamSpec {
  key: keyof IndCfg
  label: string
  min: number
  max: number
  step?: number // 미지정 = 1 (정수)
  color?: string
}

// ponytail: EMA 최대 200 — EMA_WARMUP(200)·워밍업 260봉 보장 범위. 더 키우려면 pickRange 워밍업부터 늘려야 함
const ROWS: { key: keyof IndicatorShow; name: string; desc: (c: IndCfg) => string; params: ParamSpec[] }[] = [
  {
    key: 'ema',
    name: 'EMA',
    desc: (c) => `지수이동평균 · EMA ${c.e1} / ${c.e2} / ${c.e3}`,
    params: [
      { key: 'e1', label: '단기', min: 2, max: 200, color: EMA_COLORS.e1 },
      { key: 'e2', label: '중기', min: 2, max: 200, color: EMA_COLORS.e2 },
      { key: 'e3', label: '장기', min: 2, max: 200, color: EMA_COLORS.e3 },
    ],
  },
  {
    key: 'bol',
    name: 'Bollinger Bands',
    desc: (c) => `SMA ${c.bolP} ± ${c.bolK}σ`,
    params: [
      { key: 'bolP', label: '기간', min: 5, max: 200 },
      { key: 'bolK', label: '표준편차 σ', min: 0.5, max: 5, step: 0.5 },
    ],
  },
  {
    key: 'rsi',
    name: 'RSI',
    desc: (c) => `상대강도지수 · 기간 ${c.rsiP}`,
    params: [{ key: 'rsiP', label: '기간', min: 2, max: 100 }],
  },
  { key: 'vol', name: 'Volume', desc: () => '거래량 막대', params: [] },
]

interface Props {
  show: IndicatorShow
  cfg: IndCfg
  onShow: (s: IndicatorShow) => void
  onCfg: (c: IndCfg) => void
  onClose: () => void
}

// 열릴 때만 마운트됨
export default function IndicatorSheet({ show, cfg, onShow, onCfg, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const setParam = (p: ParamSpec, raw: string) => {
    const st = p.step ?? 1
    let v = Math.round(Number(raw) / st) * st
    if (!Number.isFinite(v) || v === 0) v = p.min
    onCfg({ ...cfg, [p.key]: Math.min(p.max, Math.max(p.min, v)) })
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div className="sheet-handle" />
      <div className="sheet-head">
        <span style={{ fontSize: 16, fontWeight: 700 }}>보조지표 설정</span>
        <button className="sheet-done" onClick={onClose}>완료</button>
      </div>
      <div className="ind-set-list">
        {ROWS.map((r) => (
          <div key={r.key} className="ind-set-row" style={{ opacity: show[r.key] ? 1 : 0.55 }}>
            <div className="ind-set-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                <div className="dim num" style={{ fontSize: 11, marginTop: 2 }}>{r.desc(cfg)}</div>
              </div>
              <button
                className={`switch${show[r.key] ? ' on' : ''}`}
                onClick={() => onShow({ ...show, [r.key]: !show[r.key] })}
                aria-label={`${r.name} 표시`}
              />
            </div>
            {r.params.length > 0 && (
              <div className="ind-set-params">
                {r.params.map((p) => (
                  <label key={p.key}>
                    <span className="ind-param-label">
                      {p.color && <span className="legend-swatch" style={{ background: p.color }} />}
                      {p.label}
                    </span>
                    <input
                      type="number"
                      value={cfg[p.key]}
                      min={p.min}
                      max={p.max}
                      step={p.step ?? 1}
                      onChange={(e) => setParam(p, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </dialog>
  )
}
