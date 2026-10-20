import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNav } from '../lib/nav'
import type { PriceLineSpec } from '../components/Chart'
import SpeedChart, { ASPECT } from '../components/SpeedChart'
import SpeedSettings from '../components/SpeedSettings'
import WealthGauge from '../components/WealthGauge'
import { TF, WEALTH_TIERS, avatarSrc, fmtW, tierOf } from '../lib/data'
import { cachedProfile } from '../lib/profile'
import { cumulativeSimTime } from '../lib/report'
import { SPEED, SPEED_DEFAULT, linePct, nearPrices, pickRound, sameCfg } from '../lib/speed'
import type { Dir, SpeedConfig, SpeedPlay, SpeedRound } from '../lib/speed'
import { useStore } from '../store'

const LB = SPEED.lookback
const COOL = 6 // 공개가 끝난 뒤 [다음 판]이 켜지기까지 틱(≈0.5초) — 첫 캔들에서 TP가 나면 연타의 두 번째 탭이 결과를 건너뛴다
const COINS = [-34, -20, -7, 7, 20, 34] // 이긴 판 동전이 퍼지는 가로 폭(px)
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
// 판돈 대비 순손익 % — 반올림한 값으로 부호를 정해 '−0.0%'가 안 나오게
const net = (ret: number) => {
  const v = Math.round(ret * 1000) / 10
  return `${sign(v)}${Math.abs(v).toFixed(1)}%`
}
// 캔들 ts를 UTC 날짜로 — 일봉(뉴욕 자정 = UTC 04·05시)·분봉(UTC 13~21시)·주봉 모두 어느 시간대에서도 같은 날짜
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10).replaceAll('-', '.')

// 스피드 게임 — 블라인드 차트 한 장 → 롱/숏 → 몇 초 만에 O/X. 손익은 총자산(홈 캐릭터)에 바로 반영
export default function Speed() {
  const nav = useNav()
  const { balance, records, activeSim, syncing, speedCfg, setSpeedCfg, playSpeed } = useStore()
  const [profile] = useState(cachedProfile) // 아바타 시드 — 홈이 갱신해 둔 로컬 미러로 충분
  const [round, setRound] = useState<SpeedRound | null>(null)
  const [err, setErr] = useState(false)
  const [res, setRes] = useState<SpeedPlay | null>(null)
  const [shown, setShown] = useState(0) // 공개한 미래 캔들 수
  const [armed, setArmed] = useState(false) // 판이 뜬 직후 잠깐 잠금 — 아래 effect
  const [draft, setDraft] = useState<SpeedConfig>(() => speedCfg ?? SPEED_DEFAULT) // 첫 진입 카드·⚙ 시트에서 고르는 중인 설정
  const nextRef = useRef<Promise<SpeedRound> | null>(null)
  const seq = useRef(0) // 요청 토큰 — 설정을 바꾸는 사이 늦게 도착한 옛 판이 화면을 덮지 않게
  const sheetRef = useRef<HTMLDialogElement>(null)
  const simSec = useMemo(() => cumulativeSimTime(records).sec, [records])

  // 다음 판 — 선로딩해 둔 판이 있으면 그걸 쓰고, 화면에 뜨는 순간 그다음 판을 또 받아 둔다
  const advance = (cfg: SpeedConfig) => {
    const my = ++seq.current
    const p = nextRef.current ?? pickRound(cfg)
    nextRef.current = null
    setRound(null)
    setRes(null)
    setShown(0)
    setErr(false)
    p.then((r) => {
      if (my !== seq.current) return
      setRound(r)
      const n = pickRound(cfg)
      n.catch(() => {}) // 선로딩 실패는 그 판을 꺼낼 때 [다시 시도]로 드러난다
      nextRef.current = n
    }, () => { if (my === seq.current) setErr(true) })
  }
  // 마운트 1회 — 설정이 아직 없으면 첫 진입 카드가 시작시킨다. 진행 세션이 있어도 받아 둔다(다른 기기 state로 풀리면 바로 놀게).
  // 설정이 바뀌어도 다시 돌지 않는다 — 바뀐 설정은 ⚙ 시트가 닫힐 때 직접 적용
  const start = () => {
    const cfg = useStore.getState().speedCfg // 마운트 시점 값 — 이후 변경은 applyDraft 몫
    if (cfg) advance(cfg)
  }
  useEffect(start, [])
  // 판이 뜬 뒤 COOL만큼 롱/숏을 잠근다 — 선로딩된 판은 [다음 판] 탭과 같은 틱에 떠서, 연타의 두 번째 탭이
  // 같은 자리의 롱/숏에 떨어지면 안 본 차트에 판돈 절반이 걸린다
  useEffect(() => {
    if (!round) return
    const t = setTimeout(() => setArmed(true), COOL * SPEED.revealMs)
    return () => {
      clearTimeout(t)
      setArmed(false)
    }
  }, [round])

  const bars = res ? res.exitIndex - (LB - 1) : 0 // 청산 캔들까지 공개할 개수 (1~period)
  useEffect(() => {
    if (!res || shown >= bars + COOL) return
    const t = setTimeout(() => setShown((n) => n + 1), SPEED.revealMs)
    return () => clearTimeout(t) // 정산은 탭 시점에 끝났으니 나가도 무해
  }, [res, shown, bars])
  const done = !!res && shown >= bars

  // 화면에 보이는 규칙은 전부 판이 들고 온 cfg — 공개 중에 설정을 바꿔도 이 판의 선·문구·칸 수는 그대로
  const { lines, extent } = useMemo(() => {
    if (!round) return { lines: [], extent: [] }
    const { tpPct, slPct } = round.cfg
    const e = round.candles[LB - 1].c
    const at = (pct: number, up: boolean) => e * (1 + ((up ? 1 : -1) * pct) / 100) // speedOutcome과 같은 식 — 선이 체결가와 정확히 겹치게
    const ls: PriceLineSpec[] = [{ price: e, color: 'dim', title: '진입' }]
    if (!res) {
      // 고르기 전엔 양쪽 목표만 — 손절선까지 넷을 다 그리면 어지럽다
      if (tpPct != null) ls.push({ price: at(tpPct, true), color: 'dim', title: linePct('tp', tpPct, 'long') }, { price: at(tpPct, false), color: 'dim', title: linePct('tp', tpPct, 'short') })
    } else {
      // 고른 뒤엔 고른 방향의 목표(초록)·손절(빨강)만 — 반대편 목표가 남으면 손절선으로 읽힌다
      const long = res.dir === 'long'
      if (tpPct != null) ls.push({ price: at(tpPct, long), color: 'green', title: linePct('tp', tpPct, res.dir) })
      if (slPct != null) ls.push({ price: at(slPct, !long), color: 'red', title: linePct('sl', slPct, res.dir) })
    }
    if (done && res?.reason === 'end') ls.push({ price: res.exitPrice, color: res.pnl > 0 ? 'green' : 'red', title: '청산' })
    // 가까운 선만 처음부터 y범위에 — 탭할 때 스케일이 다시 잡히지 않고, 먼 선은 가장자리에 붙는다 (미래는 안 샌다)
    const ext = nearPrices(round.candles.slice(0, LB), e, [tpPct, slPct].flatMap((p) => (p == null ? [] : [at(p, true), at(p, false)])))
    return { lines: ls, extent: ext }
  }, [round, res, done])
  const visible = useMemo(() => round?.candles.slice(0, LB + Math.min(shown, bars)) ?? [], [round, shown, bars])

  const pick = (dir: Dir) => {
    if (!round || res || !armed || syncing) return
    const r = playSpeed(round, dir) // 탭 즉시 정산 — 이후는 표시뿐이라 공개 도중 나가도 결과가 남는다
    if (r) setRes(r)
  }

  // ⚙ 시트 — 닫힐 때(완료·배경·Esc) 바뀐 게 있으면 한 번만 적용한다. 칩마다 다시 뽑지 않게
  const openSheet = () => {
    setDraft(speedCfg ?? SPEED_DEFAULT)
    sheetRef.current?.showModal()
  }
  const applyDraft = () => {
    if (!speedCfg || sameCfg(draft, speedCfg)) return
    setSpeedCfg(draft)
    nextRef.current = null // 옛 설정으로 받아 둔 다음 판은 버린다
    if (!res) advance(draft) // 안 고른 판은 새 설정으로 다시 뽑는다 — 차트를 본 뒤 선을 맞추지 못하게
  }

  // 공개가 끝날 때까지 정산 전 잔고로 보여준다 — 헤더·아바타·게이지가 결과를 먼저 말하지 않게
  const shownBal = res && !done ? res.before : balance
  const header = (
    <div className="sim-topbar">
      <button className="back-btn" aria-label="연습으로" onClick={() => nav('/practice')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6 L9 12 L15 18" />
        </svg>
      </button>
      <b style={{ flex: 1, fontSize: 16, letterSpacing: '-0.3px' }}>스피드 게임</b>
      <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{fmtW(shownBal)}</span>
      {speedCfg && !(activeSim && !res) && (
        <button className="back-btn" aria-label="설정" onClick={openSheet}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 21 V14 M4 10 V3 M12 21 V12 M12 8 V3 M20 21 V16 M20 12 V3 M1 14 H7 M9 8 H15 M17 16 H23" />
          </svg>
        </button>
      )}
    </div>
  )

  if (activeSim && !res)
    return (
      <div className="page">
        {header}
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '28px 20px' }}>
          <b style={{ fontSize: 16 }}>진행 중인 연습이 있어요</b>
          <span className="dim" style={{ fontSize: 13, lineHeight: 1.55 }}>스피드 게임도 같은 자산을 써서,<br />연습을 마친 뒤에 할 수 있어요</span>
          <button className="pill pill-primary" style={{ marginTop: 8 }} onClick={() => nav('/sim')}>연습 이어하기</button>
        </div>
      </div>
    )

  // 첫 진입 — 설정부터 고르고 시작한다. 이후엔 이 기기에 기억해 두고 바로 판이 뜬다
  if (!speedCfg)
    return (
      <div className="page" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
        {header}
        <div className="card">
          <b style={{ fontSize: 16 }}>스피드 게임 설정</b>
          <span className="dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
            시간봉과 이익선·손절선, 몇 캔들 뒤에 청산할지 골라 주세요. 이 기기에 기억해 두고, 나중에 ⚙에서 언제든 바꿀 수 있어요.
          </span>
          <SpeedSettings value={draft} onChange={setDraft} />
          <button className="pill pill-primary pill-full" style={{ marginTop: 18 }} onClick={() => { setSpeedCfg(draft); advance(draft) }}>
            이 설정으로 시작
          </button>
        </div>
      </div>
    )

  const rc = round?.cfg ?? speedCfg // 지금 판의 규칙 (판이 뜨기 전엔 저장된 설정)
  const win = !!res && res.pnl > 0
  const fromTier = res ? tierOf(res.before) : 0
  const toTier = res ? tierOf(res.before + res.pnl) : 0
  const avatar = avatarSrc(shownBal, simSec, profile?.ageBand, profile?.gender)
  const nth = bars === 1 ? '첫 캔들' : `${bars}번째 캔들`
  const why = !res ? ''
    : res.reason === 'tp' ? `목표 ${linePct('tp', rc.tpPct, res.dir)} 도달 · ${nth} · ${net(res.ret)}`
    : res.reason === 'sl' ? `손절 ${linePct('sl', rc.slPct, res.dir)} · ${nth} · ${net(res.ret)}`
    : `${rc.period}개 마감 청산 · ${net(res.ret)}`
  const from = round ? day(round.candles[LB - 1].ts) : ''
  const to = round && res ? day(round.candles[res.exitIndex].ts) : ''

  return (
    <div className="page" style={{ paddingBottom: 'calc(150px + env(safe-area-inset-bottom))' }}>
      {header}

      <div className="card sp-strip">
        <div className={`sp-ava${done ? (win ? ' win' : ' lose') : ''}`}>
          {/* 성별 세트 에셋이 없으면 공용 세트로 1회 폴백 (홈과 같은 규칙) */}
          <img
            src={avatar}
            onError={(e) => {
              const fallback = avatarSrc(shownBal, simSec, profile?.ageBand)
              if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback
            }}
            alt="내 캐릭터" width={56} height={56} />
          {done && win && COINS.map((dx, i) => (
            <span key={i} className="sp-coin" style={{ '--dx': `${dx}px`, animationDelay: `${i * 40}ms` } as CSSProperties} />
          ))}
        </div>
        <WealthGauge asset={shownBal} />
      </div>

      <div style={{ position: 'relative' }}>
        {round
          ? <SpeedChart candles={visible} slots={round.candles.length} split={LB} lines={lines} extent={extent} />
          : <div className="speed-chart" style={{ aspectRatio: ASPECT }} />}
        {!round && (
          <div className="sp-over">
            {err ? (
              <>
                <span className="dim" style={{ fontSize: 13 }}>차트를 불러오지 못했어요</span>
                <button className="pill pill-secondary" style={{ minHeight: 40 }} onClick={() => advance(speedCfg)}>다시 시도</button>
              </>
            ) : <span className="dim" style={{ fontSize: 13 }}>차트 불러오는 중…</span>}
          </div>
        )}
        {done && res && (
          <div className="sp-over sp-result" role="status">
            {win ? (
              <svg width="88" height="88" viewBox="0 0 88 88" aria-label="성공">
                <circle className="sp-draw" cx="44" cy="44" r="32" fill="none" stroke="var(--green)" strokeWidth="9" pathLength={100} />
              </svg>
            ) : (
              <svg width="88" height="88" viewBox="0 0 88 88" aria-label="실패">
                <path className="sp-draw" d="M22 22 L66 66" fill="none" stroke="var(--red)" strokeWidth="9" strokeLinecap="round" pathLength={100} />
                <path className="sp-draw" d="M66 22 L22 66" fill="none" stroke="var(--red)" strokeWidth="9" strokeLinecap="round" pathLength={100} style={{ animationDelay: '0.22s' }} />
              </svg>
            )}
            <div className={`num ${win ? 'up' : 'down'}`} style={{ fontSize: 26, fontWeight: 800 }}>
              {sign(res.pnl)}{fmtW(Math.abs(res.pnl))}
            </div>
            <div className="dim" style={{ fontSize: 12 }}>{why}</div>
          </div>
        )}
      </div>

      {round && !res && (
        <div className="dim" style={{ textAlign: 'center', fontSize: 14 }}>{syncing ? '동기화 중…' : `다음 캔들 ${rc.period}개, 오를까요 내릴까요?`}</div>
      )}
      {done && res && round && (
        <div className="sp-reveal">
          {toTier !== fromTier && (
            <span className={`sp-tier ${toTier > fromTier ? 'up' : 'down'}`}>
              {toTier > fromTier ? `🎉 ${WEALTH_TIERS[toTier].label} 단계로 올라갔어요!` : `${WEALTH_TIERS[toTier].label} 단계로 내려갔어요`}
            </span>
          )}
          <span className="dim">
            종목 공개 · <b style={{ color: 'var(--text)' }}>{round.symbol}</b> · {from === to ? from : `${from} ~ ${to}`}
          </span>
        </div>
      )}

      <div className="trade-bar">
        <div className="trade-bar-info">
          <span className="dim small">목표 {linePct('tp', rc.tpPct, res?.dir)} · 손절 {linePct('sl', rc.slPct, res?.dir)} · {TF[rc.tf].label}봉 {rc.period}개</span>
          <span className="dim small">
            투입 <b className="num" style={{ color: 'var(--text)' }}>{fmtW(res?.stake ?? Math.round((balance * SPEED.stakePct) / 100))}</b>
          </span>
        </div>
        {done ? (
          <button className="pill pill-primary pill-full sp-next" disabled={shown < bars + COOL} onClick={() => advance(speedCfg)}>다음 판</button>
        ) : (
          <div className="sp-btns">
            <button className={`pill pill-long${res?.dir === 'long' ? ' picked' : ''}`} disabled={!round || !!res || !armed || syncing} onClick={() => pick('long')}>
              <b>롱</b><span>오른다</span>
            </button>
            <button className={`pill pill-short${res?.dir === 'short' ? ' picked' : ''}`} disabled={!round || !!res || !armed || syncing} onClick={() => pick('short')}>
              <b>숏</b><span>내린다</span>
            </button>
          </div>
        )}
      </div>

      {/* ⚙ 설정 — 항상 마운트해 두고 열 때 showModal (홈의 dialog ref 패턴) */}
      {/* 배경(::backdrop)을 눌렀을 때만 닫는다 — 대상이 dialog 자신이어도 좌표가 시트 안(여백)이면 무시. 닫히면 적용되니까 */}
      <dialog
        ref={sheetRef}
        className="sheet"
        onClose={applyDraft}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close()
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <span style={{ fontSize: 16, fontWeight: 700 }}>스피드 게임 설정</span>
          <button className="sheet-done" onClick={() => sheetRef.current?.close()}>완료</button>
        </div>
        <div className="dim" style={{ fontSize: 12, margin: '6px 0 10px' }}>{res ? '다음 판부터 적용돼요' : '바꾸면 새 차트로 다시 뽑아요'}</div>
        <SpeedSettings value={draft} onChange={setDraft} />
      </dialog>
    </div>
  )
}
