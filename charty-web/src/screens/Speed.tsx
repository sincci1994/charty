import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNav } from '../lib/nav'
import type { PriceLineSpec } from '../components/Chart'
import SpeedChart, { ASPECT } from '../components/SpeedChart'
import WealthGauge from '../components/WealthGauge'
import { WEALTH_TIERS, avatarSrc, fmtW, tierOf } from '../lib/data'
import { cachedProfile } from '../lib/profile'
import { cumulativeSimTime } from '../lib/report'
import { SPEED, pickRound } from '../lib/speed'
import type { Dir, SpeedPlay, SpeedRound } from '../lib/speed'
import { useStore } from '../store'

const LB = SPEED.lookback
const COOL = 6 // 공개가 끝난 뒤 [다음 판]이 켜지기까지 틱(≈0.5초) — 첫 캔들에서 TP가 나면 연타의 두 번째 탭이 결과를 건너뛴다
const COINS = [-34, -20, -7, 7, 20, 34] // 이긴 판 동전이 퍼지는 가로 폭(px)
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
// 일봉 ts는 뉴욕 자정(UTC 04·05시)이라 UTC 날짜로 읽으면 어느 시간대에서도 같은 날짜
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10).replaceAll('-', '.')

// 스피드 게임 — 블라인드 차트 한 장 → 롱/숏 → 몇 초 만에 O/X. 손익은 총자산(홈 캐릭터)에 바로 반영
export default function Speed() {
  const nav = useNav()
  const { balance, records, activeSim, syncing, playSpeed } = useStore()
  const [profile] = useState(cachedProfile) // 아바타 시드 — 홈이 갱신해 둔 로컬 미러로 충분
  const [round, setRound] = useState<SpeedRound | null>(null)
  const [err, setErr] = useState(false)
  const [res, setRes] = useState<SpeedPlay | null>(null)
  const [shown, setShown] = useState(0) // 공개한 미래 캔들 수
  const [armed, setArmed] = useState(false) // 판이 뜬 직후 잠깐 잠금 — 아래 effect
  const nextRef = useRef<Promise<SpeedRound> | null>(null)
  const simSec = useMemo(() => cumulativeSimTime(records).sec, [records])

  // 다음 판 — 선로딩해 둔 판이 있으면 그걸 쓰고, 화면에 뜨는 순간 그다음 판을 또 받아 둔다
  const advance = () => {
    const p = nextRef.current ?? pickRound()
    nextRef.current = null
    setRound(null)
    setRes(null)
    setShown(0)
    setErr(false)
    p.then((r) => {
      setRound(r)
      const n = pickRound()
      n.catch(() => {}) // 선로딩 실패는 그 판을 꺼낼 때 [다시 시도]로 드러난다
      nextRef.current = n
    }, () => setErr(true))
  }
  // 진행 세션이 있어도 받아 둔다 — 다른 기기 state로 세션이 풀리면 바로 놀 수 있게
  useEffect(advance, [])
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

  const { lines, extent } = useMemo(() => {
    if (!round) return { lines: [], extent: [] }
    const e = round.candles[LB - 1].c
    const tp = SPEED.tpPct / 100
    const up = { price: e * (1 + tp), title: `+${SPEED.tpPct}%` }
    const down = { price: e * (1 - tp), title: `−${SPEED.tpPct}%` }
    // 고르기 전엔 두 목표를, 고른 뒤엔 고른 쪽만(초록) — 반대편 선이 남으면 손절선으로 읽힌다(손절 없음).
    // 두 목표 가격은 extent로 y범위에 늘 남겨 탭 순간 스케일이 다시 잡히지 않게 한다
    const ls: PriceLineSpec[] = [{ price: e, color: 'dim', title: '진입' }]
    if (!res) ls.push({ ...up, color: 'dim' }, { ...down, color: 'dim' })
    else ls.push({ ...(res.dir === 'long' ? up : down), color: 'green' })
    if (done && res && !res.hitTp) ls.push({ price: res.exitPrice, color: res.pnl > 0 ? 'green' : 'red', title: '청산' })
    return { lines: ls, extent: [up.price, down.price] }
  }, [round, res, done])
  const visible = useMemo(() => round?.candles.slice(0, LB + Math.min(shown, bars)) ?? [], [round, shown, bars])

  const pick = (dir: Dir) => {
    if (!round || res || !armed || syncing) return
    const r = playSpeed(round, dir) // 탭 즉시 정산 — 이후는 표시뿐이라 공개 도중 나가도 결과가 남는다
    if (r) setRes(r)
  }

  // 공개가 끝날 때까지 정산 전 잔고로 보여준다 — 헤더·아바타·게이지가 결과를 먼저 말하지 않게
  const shownBal = res && !done ? res.before : balance
  const header = (
    <div className="sim-topbar">
      <button className="back-btn" aria-label="홈으로" onClick={() => nav('/')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6 L9 12 L15 18" />
        </svg>
      </button>
      <b style={{ flex: 1, fontSize: 16, letterSpacing: '-0.3px' }}>스피드 게임</b>
      <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{fmtW(shownBal)}</span>
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

  const win = !!res && res.pnl > 0
  const fromTier = res ? tierOf(res.before) : 0
  const toTier = res ? tierOf(res.before + res.pnl) : 0
  const avatar = avatarSrc(shownBal, simSec, profile?.ageBand, profile?.gender)

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
          ? <SpeedChart candles={visible} slots={LB + SPEED.period} split={LB} lines={lines} extent={extent} />
          : <div className="speed-chart" style={{ aspectRatio: ASPECT }} />}
        {!round && (
          <div className="sp-over">
            {err ? (
              <>
                <span className="dim" style={{ fontSize: 13 }}>차트를 불러오지 못했어요</span>
                <button className="pill pill-secondary" style={{ minHeight: 40 }} onClick={advance}>다시 시도</button>
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
            <div className="dim" style={{ fontSize: 12 }}>
              {res.hitTp
                ? `목표 ${res.dir === 'long' ? '+' : '−'}${SPEED.tpPct}% 도달 · ${bars}일째`
                : `${SPEED.period}일 마감 청산 · ${sign(res.ret)}${Math.abs(res.ret * 100).toFixed(1)}%`}
            </div>
          </div>
        )}
      </div>

      {round && !res && (
        <div className="dim" style={{ textAlign: 'center', fontSize: 14 }}>{syncing ? '동기화 중…' : `다음 ${SPEED.period}일, 오를까요 내릴까요?`}</div>
      )}
      {done && res && round && (
        <div className="sp-reveal">
          {toTier !== fromTier && (
            <span className={`sp-tier ${toTier > fromTier ? 'up' : 'down'}`}>
              {toTier > fromTier ? `🎉 ${WEALTH_TIERS[toTier].label} 단계로 올라갔어요!` : `${WEALTH_TIERS[toTier].label} 단계로 내려갔어요`}
            </span>
          )}
          <span className="dim">
            종목 공개 · <b style={{ color: 'var(--text)' }}>{round.symbol}</b> · {day(round.candles[LB - 1].ts)} ~ {day(round.candles[res.exitIndex].ts)}
          </span>
        </div>
      )}

      <div className="trade-bar">
        <div className="trade-bar-info">
          <span className="dim small">목표 {res ? (res.dir === 'long' ? '+' : '−') : '±'}{SPEED.tpPct}% · 손절 없음 · 최대 {SPEED.period}일</span>
          <span className="dim small">
            투입 <b className="num" style={{ color: 'var(--text)' }}>{fmtW(res?.stake ?? Math.round((balance * SPEED.stakePct) / 100))}</b>
          </span>
        </div>
        {done ? (
          <button className="pill pill-primary pill-full sp-next" disabled={shown < bars + COOL} onClick={advance}>다음 판</button>
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
    </div>
  )
}
