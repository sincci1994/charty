import { useRef } from 'react'
import { useNav } from '../lib/nav'
import { simProgress, useStore } from '../store'

export default function Practice() {
  const nav = useNav()
  const { activeSim, endNow } = useStore()
  const dialogRef = useRef<HTMLDialogElement>(null)

  const quit = () => {
    dialogRef.current?.close()
    endNow()
    nav('/sim')
  }

  return (
    <div className="page">
      <header style={{ padding: '4px 0 10px' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.374px' }}>연습 모드 선택</div>
        <div className="sub" style={{ fontSize: 15, marginTop: 6 }}>원하는 연습 방식으로 시작해보세요!</div>
      </header>

      {activeSim && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="quick" style={{ flex: 1, padding: '14px 16px', gap: 12 }} onClick={() => nav('/sim')}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px' }}>진행 중인 연습 이어하기</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div className="track" style={{ flex: 1, height: 5, marginTop: 0 }}>
                  <div style={{ width: `${simProgress(activeSim)}%` }} />
                </div>
                <span className="num sub" style={{ fontSize: 12, fontWeight: 600 }}>{simProgress(activeSim)}%</span>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6 L15 12 L9 18" />
            </svg>
          </button>
          <button className="quick" style={{ flexShrink: 0, padding: '14px 16px' }} onClick={() => dialogRef.current?.showModal()}>
            <span className="sub" style={{ fontSize: 13, fontWeight: 600 }}>그만두기</span>
          </button>
        </div>
      )}

      {/* Simulation Mode — 그라데이션 보더 강조 카드 (세션 중엔 디밍) */}
      <div style={{ borderRadius: 20, padding: 1.5, background: 'var(--grad)', opacity: activeSim ? 0.55 : 1 }}>
        <div className="card" style={{ border: 'none', borderRadius: 18.5, padding: '22px 20px', gap: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>Simulation Mode</div>
          <div className="sub" style={{ fontSize: 13, marginTop: 2 }}>실제 차트를 보고 매매 연습</div>
          <div className="sub" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 14, letterSpacing: '-0.1px' }}>
            캔들을 하나씩 직접 생성하며 흐름을 예측하고 매매 판단을 훈련합니다.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, fontSize: 13, letterSpacing: '-0.1px' }}>
            <div>지정가 주문 / 감정 기록 포함</div>
            <div>실전감 + 회고 훈련</div>
          </div>
          {activeSim ? (
            <div className="pill sub" style={{ background: 'var(--card2)', fontSize: 14, marginTop: 18, cursor: 'default' }}>
              진행중인 연습을 마치면 시작할 수 있어요
            </div>
          ) : (
            <button className="pill pill-primary" style={{ fontWeight: 600, gap: 6, marginTop: 18 }} onClick={() => nav('/practice/style')}>
              지금 시작하기
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6 L15 12 L9 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Speed Quiz — 준비중 (디밍) */}
      <div className="card" style={{ borderRadius: 20, padding: '22px 20px', gap: 0, opacity: 0.55 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>Speed Quiz</div>
          <span className="sub" style={{ fontSize: 11, fontWeight: 600, background: 'var(--card2)', borderRadius: 999, padding: '3px 9px' }}>준비중</span>
        </div>
        <div className="sub" style={{ fontSize: 13, marginTop: 2 }}>빠른 판단 훈련용 퀴즈</div>
        <div className="sub" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, fontSize: 13, letterSpacing: '-0.1px' }}>
          <div>감정/이유 버튼식 선택</div>
          <div>5분 완성 / 즉시 피드백</div>
        </div>
        <div className="pill sub" style={{ background: 'var(--card2)', marginTop: 18, cursor: 'not-allowed' }}>개발 중입니다</div>
      </div>

      <dialog ref={dialogRef}>
        <h3>연습을 종료할까요?</h3>
        <p>남은 보유 주식은 종가로 매도되고<br />회고를 작성합니다.</p>
        <div className="actions">
          <button className="pill pill-secondary" onClick={() => dialogRef.current?.close()}>취소</button>
          <button className="pill pill-danger" onClick={quit}>종료하기</button>
        </div>
      </dialog>
    </div>
  )
}
