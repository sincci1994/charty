import { useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../lib/nav'
import Chart, { BOL_COLOR, EMA_COLORS, type IndicatorShow, type PriceLineSpec } from '../components/Chart'
import IndicatorSheet, { DEFAULT_CFG, type IndCfg } from '../components/IndicatorSheet'
import NewsPanel from '../components/NewsPanel'
import OrderSheet from '../components/OrderSheet'
import { simProgress, useStore } from '../store'
import { LOOKBACK, TF, bollinger, ema, fmtW, loadCandles, loadEcon, loadNewsArchive, resampleCandles, rsi, styleLabel } from '../lib/data'
import { equity } from '../lib/engine'
import type { Headline } from '../lib/data'
import type { Candle, EconIndicator, Timeframe } from '../types'

const TF_CHIPS = Object.keys(TF) as Timeframe[]
const IND_KEYS = ['ema', 'bol', 'rsi', 'vol'] as const
// 종목 숨김(******) 유지 — 회사명이 든 헤드라인은 걸러냄 (ETF는 해당 없음)
const LEAK_NAMES: Partial<Record<string, string>> = { AAPL: 'apple', NVDA: 'nvidia', TSLA: 'tesla', MSFT: 'microsoft' }

function progressText(pct: number) {
  if (pct >= 100) return '모든 캔들이 생성되었습니다!'
  if (pct >= 80) return '마지막 캔들입니다'
  if (pct >= 60) return '거의 다 왔어요!'
  return '차트 분석을 계속해보세요'
}

export default function Simulation() {
  const nav = useNav()
  const { activeSim: sim, candles, nextCandle, endNow, cancelOrder, resume } = useStore()
  const [show, setShow] = useState<IndicatorShow>({ ema: true, bol: false, rsi: false, vol: true })
  const [cfg, setCfg] = useState<IndCfg>(DEFAULT_CFG)
  const [indOpen, setIndOpen] = useState(false)
  const [sheetDir, setSheetDir] = useState<'LONG' | 'SHORT' | null>(null)
  const [viewTf, setViewTf] = useState<Timeframe | null>(null) // null = 세션 TF
  const [extra, setExtra] = useState<Partial<Record<Timeframe, Candle[] | 'missing'>>>({}) // 잘게 보기용 파일 캐시
  const [tab, setTab] = useState<'chart' | 'news'>('chart')
  const [econ, setEcon] = useState<EconIndicator[] | null>(null)
  const [headlines, setHeadlines] = useState<Headline[] | undefined>()
  useEffect(() => {
    if (tab !== 'news') return
    if (!econ) loadEcon().then(setEcon).catch(() => setEcon([]))
    if (!headlines) loadNewsArchive().then(setHeadlines).catch(() => setHeadlines([]))
  }, [tab, econ, headlines])
  const endDialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!sim) nav('/practice', { replace: true })
    else resume().catch(() => nav('/practice', { replace: true })) // 캔들 로드 실패 시 무한 로딩 방지 — sim은 보존되므로 재진입=재시도
  }, [sim, nav, resume])

  // 포지션/미체결이 생기면 상태 카드를 자동으로 펼침 (수동 접기는 유지)
  const hasItems = !!sim && (!!sim.positions.LONG || !!sim.positions.SHORT || sim.openOrders.length > 0)
  const [foldOpen, setFoldOpen] = useState(() => hasItems || !!sim?.done)
  useEffect(() => {
    if (hasItems || sim?.done) setFoldOpen(true)
  }, [hasItems, sim?.done])

  // 체결 토스트 — trades가 늘어나면 새 체결로 간주. 사라짐은 CSS 애니메이션(toastLife)에 맡김
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)
  const prevTrades = useRef(sim?.trades.length ?? 0)
  useEffect(() => {
    if (!sim) return
    const n = sim.trades.length
    if (n > prevTrades.current) {
      const fresh = sim.trades.slice(prevTrades.current)
      const t = fresh[fresh.length - 1]
      const msg =
        fresh.length > 1
          ? `주문 ${fresh.length}건 체결`
          : `${t.side.includes('LONG') ? 'Long' : 'Short'} ${t.side.startsWith('OPEN') ? '진입' : '청산'} ${t.qty}주 @ ${fmtW(t.price)} 체결`
      setToast({ id: Date.now(), msg })
    }
    prevTrades.current = n
  }, [sim])

  // 시뮬 시간이 경제지표 발표 시점을 지나면 토스트
  const prevNowRef = useRef<number | null>(null)
  useEffect(() => {
    if (!sim || candles.length === 0 || !econ) return
    const now = candles[sim.cursor].ts + TF[sim.timeframe].sec
    const prev = prevNowRef.current
    prevNowRef.current = now
    if (prev !== null && now > prev && econ.some((e) => e.data.some((p) => p[0] >= prev && p[0] < now)))
      setToast({ id: Date.now(), msg: '새 경제지표가 발표되었어요' })
  }, [sim, candles, econ])

  const indicators = useMemo(() => {
    const closes = candles.map((c) => c.c)
    return {
      emas: { e1: ema(closes, cfg.e1), e2: ema(closes, cfg.e2), e3: ema(closes, cfg.e3) },
      bands: bollinger(closes, cfg.bolP, cfg.bolK),
      rsis: rsi(closes, cfg.rsiP),
    }
  }, [candles, cfg])

  const visible = useMemo(() => {
    if (!sim) return null // !sim이면 아래 로딩 return이 먼저라 사용되지 않음
    const from = Math.max(0, sim.startIndex - LOOKBACK)
    const to = sim.cursor + 1
    const cut = (a: (number | null)[]) => a.slice(from, to)
    const { emas, bands, rsis } = indicators
    return {
      candles: candles.slice(from, to),
      emas: { e1: cut(emas.e1), e2: cut(emas.e2), e3: cut(emas.e3) },
      bands: { upper: cut(bands.upper), lower: cut(bands.lower) },
      rsi: cut(rsis),
    }
  }, [sim, candles, indicators])

  // 세션 TF와 다른 시간봉 보기 — 미래 누출 방지: 컷오프(현재 캔들 ts + 세션 간격) 이후 데이터는 절대 사용 안 함
  const effTf: Timeframe = viewTf ?? sim?.timeframe ?? '4h'
  const view = useMemo(() => {
    if (!sim || candles.length === 0 || effTf === sim.timeframe) return null // null → visible 사용
    const cutoff = candles[sim.cursor].ts + TF[sim.timeframe].sec
    const fromTs = candles[Math.max(0, sim.startIndex - LOOKBACK)].ts
    let src: Candle[]
    if (TF[effTf].sec > TF[sim.timeframe].sec) {
      // 굵게 보기: 세션 캔들을 자른 뒤 리샘플 — 마지막 버킷은 부분 캔들(실전과 동일)
      src = resampleCandles(candles.filter((c) => c.ts < cutoff), TF[effTf].sec)
    } else {
      // 잘게 보기: 해당 TF 파일에서 컷오프 이전만 — 컷오프가 세션 캔들 경계라 열린 캔들 없음
      const file = extra[effTf]
      if (!file || file === 'missing') return null
      src = file.filter((c) => c.ts < cutoff)
    }
    const closes = src.map((c) => c.c)
    const emas = { e1: ema(closes, cfg.e1), e2: ema(closes, cfg.e2), e3: ema(closes, cfg.e3) }
    const bands = bollinger(closes, cfg.bolP, cfg.bolK)
    const rsis = rsi(closes, cfg.rsiP)
    const start = Math.max(0, src.findIndex((c) => c.ts >= fromTs))
    const cut = (a: (number | null)[]) => a.slice(start)
    return {
      candles: src.slice(start),
      emas: { e1: cut(emas.e1), e2: cut(emas.e2), e3: cut(emas.e3) },
      bands: { upper: cut(bands.upper), lower: cut(bands.lower) },
      rsi: cut(rsis),
    }
  }, [sim, candles, effTf, extra, cfg])

  const pickTf = (tf: Timeframe) => {
    if (!sim) return
    if (tf === sim.timeframe || TF[tf].sec > TF[sim.timeframe].sec) return setViewTf(tf)
    const cached = extra[tf]
    if (cached === 'missing') return
    if (cached) return setViewTf(tf)
    const fromTs = candles[Math.max(0, sim.startIndex - LOOKBACK)]?.ts ?? 0
    loadCandles(sim.symbol, tf)
      .then((file) => {
        if (file.length === 0 || file[0].ts > fromTs) {
          setExtra((e) => ({ ...e, [tf]: 'missing' }))
          setToast({ id: Date.now(), msg: `이 구간엔 ${tf} 데이터가 없어요` })
        } else {
          setExtra((e) => ({ ...e, [tf]: file }))
          setViewTf(tf)
        }
      })
      .catch(() => setToast({ id: Date.now(), msg: '데이터를 불러오지 못했어요' }))
  }

  if (!sim || candles.length === 0) return <div className="page"><div className="empty">불러오는 중…</div></div>

  const pct = simProgress(sim)
  const price = candles[sim.cursor].c
  const nowTs = candles[sim.cursor].ts + TF[sim.timeframe].sec // 현재 캔들 마감 시각 = 시뮬의 '지금'
  const eq = equity(sim, price)
  const pnl = eq - sim.startBalance
  const pnlPct = (pnl / sim.startBalance) * 100
  const posCount = (sim.positions.LONG ? 1 : 0) + (sim.positions.SHORT ? 1 : 0)
  const chartData = (view ?? visible)!

  const lines: PriceLineSpec[] = []
  for (const k of ['LONG', 'SHORT'] as const) {
    const p = sim.positions[k]
    if (!p) continue
    const pct = ((k === 'LONG' ? price - p.avgPrice : p.avgPrice - price) / p.avgPrice) * 100
    lines.push({ price: p.avgPrice, up: k === 'LONG', title: `${k} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` })
  }
  for (const o of sim.openOrders)
    lines.push({ price: o.price, up: o.side.includes('LONG'), title: `${o.side.startsWith('OPEN') ? '진입' : '청산'} ${o.qty}주` })

  const legend: { txt: string; color: string }[] = []
  if (show.ema)
    legend.push(
      { txt: `EMA ${cfg.e1}`, color: EMA_COLORS.e1 },
      { txt: `EMA ${cfg.e2}`, color: EMA_COLORS.e2 },
      { txt: `EMA ${cfg.e3}`, color: EMA_COLORS.e3 },
    )
  if (show.bol) legend.push({ txt: `BOL ${cfg.bolP},${cfg.bolK}σ`, color: BOL_COLOR })
  if (show.rsi) legend.push({ txt: `RSI ${cfg.rsiP}`, color: EMA_COLORS.e3 })

  return (
    <div className="page" style={{ paddingBottom: sim.done ? 16 : 130 }}>
      <div className="sim-topbar">
        <button className="back-btn" onClick={() => nav('/practice')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6 L9 12 L15 18" />
          </svg>
        </button>
        <div className="sim-tabs">
          <button className={`sim-tab${tab === 'chart' ? ' active' : ''}`} onClick={() => setTab('chart')}>Chart</button>
          <button className={`sim-tab${tab === 'news' ? ' active' : ''}`} onClick={() => setTab('news')}>News</button>
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
        <span className="dim small" style={{ whiteSpace: 'nowrap' }}>{sim.done ? `${sim.symbol} · ` : ''}{styleLabel(sim.style, sim.styleLabel)} · {sim.timeframe}</span>
        <div className="tf-chips" style={tab === 'news' ? { visibility: 'hidden' } : undefined}>
          {TF_CHIPS.map((tf) => {
            const missing = TF[tf].sec < TF[sim.timeframe].sec && extra[tf] === 'missing'
            return (
              <button
                key={tf}
                className={tf === effTf ? 'chip active' : missing ? 'chip off' : 'chip'}
                disabled={missing}
                onClick={() => pickTf(tf)}
              >
                {tf}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'news' ? (
        !econ ? (
          <div className="card empty" style={{ minHeight: 320, justifyContent: 'center' }}>불러오는 중…</div>
        ) : (
          <NewsPanel
            econ={econ}
            nowTs={nowTs}
            headlines={headlines?.filter((h) => {
              const t = h[1].toLowerCase()
              const name = LEAK_NAMES[sim.symbol]
              return !t.includes(sim.symbol.toLowerCase()) && (!name || !t.includes(name))
            })}
          />
        )
      ) : (
        <div style={{ position: 'relative' }}>
          <Chart
            candles={chartData.candles}
            emas={chartData.emas}
            bands={chartData.bands}
            rsi={chartData.rsi}
            show={show}
            lines={lines}
            maskTime={!sim.done}
          />
          {legend.length > 0 && (
            <div className="chart-legend">
              {legend.map((lg) => (
                <span key={lg.txt}>
                  <span className="legend-swatch" style={{ background: lg.color }} />
                  {lg.txt}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ind-row">
        <div className="ind-chips" style={tab === 'news' ? { visibility: 'hidden' } : undefined}>
          {IND_KEYS.map((k) => (
            <button
              key={k}
              className={show[k] ? 'chip active' : 'chip'}
              onClick={() => setShow({ ...show, [k]: !show[k] })}
            >
              {k.toUpperCase()}
            </button>
          ))}
          <button className="ind-set-btn" aria-label="보조지표 설정" onClick={() => setIndOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" /><circle cx="9" cy="7" r="2.6" fill="var(--bg)" />
              <line x1="4" y1="17" x2="20" y2="17" /><circle cx="15" cy="17" r="2.6" fill="var(--bg)" />
            </svg>
          </button>
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

      <details className="card fold" open={foldOpen} onToggle={(e) => setFoldOpen(e.currentTarget.open)}>
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
          {sheetDir && (
            <OrderSheet sim={sim} currentPrice={price} dir={sheetDir} onClose={() => setSheetDir(null)} />
          )}
        </>
      )}

      {indOpen && (
        <IndicatorSheet show={show} cfg={cfg} onShow={setShow} onCfg={setCfg} onClose={() => setIndOpen(false)} />
      )}

      {toast && (
        <div className="toast-wrap" key={toast.id}>
          <div className="toast">
            <span className="toast-check">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 L10 17.5 L19 7" /></svg>
            </span>
            {toast.msg}
          </div>
        </div>
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
