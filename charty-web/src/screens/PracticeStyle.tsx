import { useState } from 'react'
import { Navigate, useNav } from '../lib/nav'
import type { Style } from '../types'
import { SETS, STYLES, TF, barsFor, estTime } from '../lib/data'
import type { SetKey } from '../lib/data'
import { useStore } from '../store'

export default function PracticeStyle() {
  const nav = useNav()
  const { activeSim, startSim, customs } = useStore()
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1) // R14 — 1: 스타일, 2: 종목 세트
  const [setKey, setSetKey] = useState<SetKey | null>(null)

  // 진행중 세션이 있으면 새 시작 불가 — 연습 탭 게이트에서 그만두기 먼저
  // (loading 중엔 startSim 직후 activeSim이 생기며 리렌더되므로 가드 제외, nav('/sim')이 이어짐)
  if (activeSim && !loading) return <Navigate to="/practice" replace />

  const start = async () => {
    if (!sel || !setKey) return
    setLoading(true)
    try {
      await startSim(sel, setKey)
      nav('/sim')
      // 성공 시 loading을 풀지 않음 — 풀면 /sim 전환(transition)보다 먼저 리렌더되어 위 가드가 /practice로 덮어씀
    } catch (e) {
      alert(e instanceof Error ? e.message : '시작 실패')
      setLoading(false)
    }
  }

  // Step2 요약 칩용 — 선택한 스타일의 라벨·타임프레임
  const selCfg = sel
    ? STYLES[sel as Style]
      ? { label: STYLES[sel as Style].label, tf: STYLES[sel as Style].tf }
      : (() => { const c = customs.find((x) => x.id === sel); return c ? { label: c.name, tf: c.tf } : null })()
    : null

  return (
    <div className="page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 0' }}>
        <button className="back-btn" onClick={() => (step === 2 ? setStep(1) : nav('/practice'))} aria-label="뒤로">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6 L9 12 L15 18" /></svg>
        </button>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.374px' }}>{step === 1 ? '트레이딩 스타일 선택' : '종목 세트 선택'}</div>
        <span className="dim num" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{step}/2</span>
      </header>

      {step === 1 && (
        <>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, letterSpacing: '-0.1px' }}>
            투자 기간은 해당 기간 내 거래 종료를 목표로 하며, 시간 단위는 트레이딩 시 사용할 캔들의 시간 단위를 의미합니다
          </p>

          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 8 }}>기본 트레이딩 스타일</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(Object.keys(STYLES) as Style[]).map((key) => (
              <button key={key} className={`style-card${sel === key ? ' selected' : ''}`} disabled={loading} onClick={() => setSel(key)}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{STYLES[key].label}</div>
                  <div className="dim" style={{ fontSize: 13, marginTop: 3 }}>
                    거래 기간 {STYLES[key].period} · 차트 간격 {TF[STYLES[key].tf].label} · {estTime(STYLES[key].bars)} 소요
                  </div>
                </div>
                <div className="radio">
                  {sel === key && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 8 }}>커스텀 스타일</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {customs.map((c) => (
              // div — 설정 pill이 안에 있어 button 중첩 불가
              <div key={c.id} className={`style-card${sel === c.id ? ' selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => !loading && setSel(c.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{c.name}</div>
                  <div className="dim" style={{ fontSize: 13, marginTop: 3 }}>
                    거래 기간 {c.periodValue}{c.periodUnit} · 차트 간격 {TF[c.tf].label} · {estTime(barsFor(c))} 소요
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); nav(`/practice/style/custom/${c.id}`) }}
                  style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '5px 12px' }}
                >
                  설정
                </button>
                <div className="radio">
                  {sel === c.id && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
                  )}
                </div>
              </div>
            ))}
            <button className="dim" style={{ background: 'transparent', border: '1.5px dashed var(--hairline)', borderRadius: 16, padding: '16px 18px', fontSize: 14 }} onClick={() => nav('/practice/style/custom')}>
              + 새 커스텀 스타일 추가
            </button>
          </div>
        </>
      )}

      {step === 2 && selCfg && (
        <>
          <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-soft)', borderRadius: 999, padding: '6px 12px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{selCfg.label} · 차트 간격 {TF[selCfg.tf].label}</span>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 8 }}>종목 세트</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(Object.keys(SETS) as SetKey[]).map((k) => (
              <button key={k} className={`style-card${setKey === k ? ' selected' : ''}`} disabled={loading} onClick={() => setSetKey(k)}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{SETS[k].label}</span>
                    {SETS[k].vol && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 8px',
                        ...(SETS[k].vol === '높음'
                          ? { color: 'var(--red)', background: 'rgba(244,67,54,0.14)' }
                          : { color: '#f5a623', background: 'rgba(245,166,35,0.14)' }),
                      }}>
                        변동성 {SETS[k].vol}
                      </span>
                    )}
                  </div>
                  <div className="dim" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{SETS[k].desc}</div>
                  <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>
                    {SETS[k].tickers ? `종목 ${SETS[k].tickers!.length}개` : '전체 종목'} · 무작위 출제
                  </div>
                </div>
                <div className="radio">
                  {setKey === k && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
                  )}
                </div>
              </button>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.55 }}>
            세트 안에서 무작위 종목·무작위 구간이 출제돼요. 종목명은 시뮬레이션이 끝날 때까지 공개되지 않아요.
          </p>
        </>
      )}

      {/* ponytail: 디자인의 fixed 하단 CTA 바는 플로팅 탭바와 겹쳐 생략 — 페이지 흐름 내 배치 */}
      {step === 1 ? (
        <>
          <button className="pill pill-full pill-primary cta" style={{ marginTop: 12 }} disabled={!sel} onClick={() => setStep(2)}>
            다음
          </button>
          {!sel && <div className="dim center" style={{ fontSize: 12 }}>트레이딩 스타일을 선택해주세요</div>}
        </>
      ) : (
        <>
          <button className={`pill pill-full pill-primary cta${loading ? ' pulse' : ''}`} style={{ marginTop: 12 }} disabled={!setKey || loading} onClick={start}>
            시뮬레이션 시작
          </button>
          {!setKey && <div className="dim center" style={{ fontSize: 12 }}>종목 세트를 선택해주세요</div>}
        </>
      )}
    </div>
  )
}
