import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Chart, { type IndicatorShow } from '../components/Chart'
import OrderSheet from '../components/OrderSheet'
import { currentEquity, useStore } from '../store'
import { LOOKBACK, STYLES, bollinger, ema, fmtW, rsi } from '../lib/data'
import type { Style } from '../types'

const TF_CHIPS = ['5m', '15m', '1h', '4h', '1d'] // 표시 전용 — 현재 시뮬 TF만 활성
const IND_KEYS = ['ema', 'bol', 'rsi', 'vol'] as const

function progressText(pct: number) {
  if (pct >= 100) return '모든 캔들이 생성되었습니다!'
  if (pct >= 80) return '마지막 캔들입니다'
  if (pct >= 60) return '거의 다 왔어요!'
  return '차트 분석을 계속해보세요'
}

export default function Simulation() {
  const nav = useNavigate()
  const { activeSim: sim, candles, nextCandle, endNow, cancelOrder, resume } = useStore()
  const [show, setShow] = useState<IndicatorShow>({ ema: true, bol: false, rsi: false, vol: true })
  const [sheetDir, setSheetDir] = useState<'LONG' | 'SHORT' | null>(null)
  const endDialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!sim) nav('/practice', { replace: true })
    else resume()
  }, [sim, nav, resume])

  const indicators = useMemo(() => {
    const closes = candles.map((c) => c.c)
    return {
      emas: { e13: ema(closes, 13), e25: ema(closes, 25), e200: ema(closes, 200) },
      bands: bollinger(closes),
      rsis: rsi(closes),
    }
  }, [candles])

  const visible = useMemo(() => {
    if (!sim) {
      return {
        candles: [],
        emas: { e13: [], e25: [], e200: [] },
        bands: { upper: [], lower: [] },
        rsi: [],
      }
    }
    const from = Math.max(0, sim.startIndex - LOOKBACK)
    const to = sim.cursor + 1
    const cut = (a: (number | null)[]) => a.slice(from, to)
    const { emas, bands, rsis } = indicators
    return {
      candles: candles.slice(from, to),
      emas: { e13: cut(emas.e13), e25: cut(emas.e25), e200: cut(emas.e200) },
      bands: { upper: cut(bands.upper), lower: cut(bands.lower) },
      rsi: cut(rsis),
    }
  }, [sim, candles, indicators])

  if (!sim || candles.length === 0) return <div className="page"><div className="empty">불러오는 중…</div></div>

  const total = sim.endIndex - sim.startIndex
  const pct = total > 0 ? Math.round(((sim.cursor - sim.startIndex) / total) * 100) : 100
  const price = candles[sim.cursor].c
  const eq = currentEquity(sim, candles)
  const pnl = eq - sim.startBalance
  const pnlPct = (pnl / sim.startBalance) * 100
  const posCount = (sim.positions.LONG ? 1 : 0) + (sim.positions.SHORT ? 1 : 0)
  const styleLabel = STYLES[sim.style as Style]?.label ?? sim.styleLabel

  return (
    <div className="page" style={{ paddingBottom: sim.done ? 16 : 130 }}>
      <div className="sim-topbar">
        <button className="back-btn" onClick={() => nav('/practice')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6 L9 12 L15 18" />
          </svg>
        </button>
        <div className="sim-tabs">
          <div className="sim-tab active">Chart</div>
          <div className="sim-tab off">
            News <span className="badge">준비중</span>
          </div>
        </div>
        {!sim.done && (
          <button className="end-btn" onClick={() => endDialogRef.current?.showModal()}>End</button>
        )}
      </div>

      <div className="progress-row">
        <div className="track" style={{ flex: 1, marginTop: 0, height: 7 }}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <b className="num" style={{ fontSize: 12 }}>{pct}%</b>
        <span className="dim" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{progressText(pct)}</span>
      </div>

      <div className="symbol-row">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <b style={{ letterSpacing: 1 }}>{sim.done ? sim.symbol : '******'}</b>
          <span className="dim small">{sim.done ? '' : '(숨김) · '}{styleLabel} · {sim.timeframe}</span>
        </div>
        <div className="tf-chips">
          {TF_CHIPS.map((tf) => (
            <span key={tf} className={tf === sim.timeframe ? 'chip active' : 'chip off'}>{tf}</span>
          ))}
        </div>
      </div>

      <Chart candles={visible.candles} emas={visible.emas} bands={visible.bands} rsi={visible.rsi} show={show} />

      <div className="ind-row">
        <div className="ind-chips">
          {IND_KEYS.map((k) => (
            <button
              key={k}
              className={show[k] ? 'chip active' : 'chip'}
              onClick={() => setShow({ ...show, [k]: !show[k] })}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
        {sim.done ? (
          <button className="pill pill-primary pulse" style={{ height: 36, fontSize: 12, fontWeight: 600 }} onClick={() => nav('/review')}>
            지금 회고 작성하기 ›
          </button>
        ) : (
          <button className="next-btn" onClick={nextCandle}>
            다음 캔들
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5 L18 12 L7 19 Z" /></svg>
          </button>
        )}
      </div>

      <details className="card fold" open={sim.done}>
        <summary>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span className="dim small">포지션 <b style={{ color: 'var(--text)' }}>{posCount}</b></span>
            <span className="dim small">미체결 <b style={{ color: 'var(--text)' }}>{sim.openOrders.length}</b></span>
            <span className={`small num ${pnl === 0 ? 'dim' : pnl > 0 ? 'green' : 'red'}`} style={{ fontWeight: 600 }}>
              {pnl >= 0 ? '+' : '-'}{fmtW(Math.abs(pnl))} ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
            </span>
          </div>
          <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9 L12 15 L18 9" />
          </svg>
        </summary>
        <div className="fold-body">
          {posCount === 0 && <div className="empty" style={{ padding: '10px 0' }}>보유 포지션 없음</div>}
          {(['LONG', 'SHORT'] as const).map((k) => {
            const p = sim.positions[k]
            if (!p) return null
            const pPnl = (k === 'LONG' ? price - p.avgPrice : p.avgPrice - price) * p.qty
            const pPnlPct = ((k === 'LONG' ? price - p.avgPrice : p.avgPrice - price) / p.avgPrice) * 100
            return (
              <div key={k} className="pos-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge-dir ${k === 'LONG' ? 'long' : 'short'}`}>{k}</span>
                  <span className="small num" style={{ fontWeight: 600 }}>{p.qty}주 · Avg {fmtW(p.avgPrice)}</span>
                  <span className={`small num ${pPnl >= 0 ? 'green' : 'red'}`} style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>
                    {pPnl >= 0 ? '+' : '-'}{fmtW(Math.abs(pPnl))} ({pPnl >= 0 ? '+' : ''}{pPnlPct.toFixed(1)}%)
                  </span>
                </div>
                <details className="entry-fold">
                  <summary>Entry History</summary>
                  <div className="entry-list">
                    {(p.entries ?? []).map((e, i) => (
                      <div key={i} className="dim num" style={{ fontSize: 11 }}>{e.qty}주 @ {fmtW(e.price)}</div>
                    ))}
                  </div>
                </details>
              </div>
            )
          })}
          {sim.openOrders.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sim.openOrders.map((o) => (
                <div key={o.id} className="order-row">
                  <span className={`badge-dir ${o.side.includes('LONG') ? 'long' : 'short'}`}>
                    {o.side.includes('LONG') ? 'LONG' : 'SHORT'}
                  </span>
                  <span className="small num" style={{ flex: 1 }}>
                    {o.side.startsWith('OPEN') ? '진입' : '청산'} {o.qty}주 @ {fmtW(o.price)}
                  </span>
                  <span className="dim" style={{ fontSize: 10 }}>대기</span>
                  <button className="cancel-btn" onClick={() => cancelOrder(o.id)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {!sim.done && (
        <>
          <div className="trade-bar">
            <div className="trade-bar-info">
              <span className="dim small">Assets <b className="num" style={{ color: 'var(--text)' }}>{fmtW(eq)}</b></span>
              <span className="dim small">현재가 <b className="num" style={{ color: 'var(--text)' }}>{fmtW(price)}</b></span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="pill pill-long" style={{ flex: 1 }} onClick={() => setSheetDir('LONG')}>Long</button>
              <button className="pill pill-short" style={{ flex: 1 }} onClick={() => setSheetDir('SHORT')}>Short</button>
            </div>
          </div>
          <OrderSheet
            sim={sim}
            currentPrice={price}
            dir={sheetDir ?? 'LONG'}
            open={sheetDir !== null}
            onClose={() => setSheetDir(null)}
          />
        </>
      )}

      <dialog ref={endDialogRef}>
        <h3>지금 종료할까요?</h3>
        <p>보유 중인 포지션은 현재 종가로<br />강제 청산됩니다. 진행할까요?</p>
        <div className="actions">
          <button className="pill pill-secondary" onClick={() => endDialogRef.current?.close()}>취소</button>
          <button className="pill pill-danger" onClick={() => { endDialogRef.current?.close(); endNow() }}>종료하기</button>
        </div>
      </dialog>
    </div>
  )
}
