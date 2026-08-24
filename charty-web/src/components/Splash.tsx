// Launch 스플래시 비주얼 (디자인 원본 Launch.dc.html) — 로고 스트로크 드로잉 → 로고 크로스페이드 → 타이틀.
// Welcome(웰컴 페이즈)과 shell(설치형 앱 콜드 스타트 오버레이)이 공유. 키프레임(ch*)은 index.css.
export default function Splash({ hidden, onSkip }: { hidden: boolean; onSkip: () => void }) {
  return (
    <div
      onClick={onSkip}
      style={{
        position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        background: 'radial-gradient(130% 100% at 50% 0%, #101838 0%, #0A0F26 48%, #06081A 100%)',
        opacity: hidden ? 0 : 1, transform: hidden ? 'scale(1.07)' : 'scale(1)',
        transition: 'opacity 0.6s ease 0.05s, transform 0.6s ease 0.05s',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
    >
      <div style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(61,92,255,0.3), transparent 65%)', filter: 'blur(40px)', animation: 'chPulse 3s ease-in-out infinite' }} />
      <div style={{ width: 132, height: 132, position: 'relative', filter: 'drop-shadow(0 10px 30px rgba(80,110,255,0.5))' }}>
        <svg width="132" height="132" viewBox="0 0 120 120" fill="none" style={{ position: 'absolute', inset: 0, animation: 'chFadeOut 0.45s ease 2s both' }}>
          <defs>
            <linearGradient id="chLg" gradientUnits="userSpaceOnUse" x1="12" y1="78" x2="108" y2="42">
              <stop offset="0" stopColor="#22D3FF" />
              <stop offset="0.5" stopColor="#3D5CFF" />
              <stop offset="1" stopColor="#A94BFF" />
            </linearGradient>
          </defs>
          <path d="M60 15.3 A44.7 44.7 0 0 1 60 104.7 A44.7 44.7 0 0 1 60 15.3" stroke="url(#chLg)" strokeWidth="9.2" strokeLinecap="round" pathLength={100} style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: 'chDraw 0.9s cubic-bezier(0.55,0,0.3,1) 0.1s both' }} />
          <polyline points="27.5,82.5 50,52.5 65,71.5 84.5,49.5" stroke="url(#chLg)" strokeWidth="9.2" strokeLinecap="round" strokeLinejoin="round" pathLength={100} style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: 'chDraw 0.7s cubic-bezier(0.4,0,0.3,1) 1.05s both' }} />
          <path d="M91.8 41.3 L88.6 56.6 L77 46.2 Z" fill="url(#chLg)" style={{ opacity: 0, animation: 'chFade 0.3s ease 1.7s both' }} />
        </svg>
        <img src="/logo-mark.png" alt="" style={{ position: 'absolute', inset: 0, width: 132, height: 132, opacity: 0, animation: 'chFade 0.45s ease 1.95s both' }} />
      </div>
      <div style={{ fontSize: 29, fontWeight: 800, letterSpacing: '-0.5px', color: '#F5F7FF', marginTop: 26, opacity: 0, animation: 'chUp 0.55s cubic-bezier(0.2,0.7,0.2,1) 2.1s both', position: 'relative' }}>Charty</div>
      <div style={{ fontSize: 13, color: '#8A93BE', marginTop: 8, opacity: 0, animation: 'chUp 0.55s cubic-bezier(0.2,0.7,0.2,1) 2.25s both', position: 'relative' }}>차트 위에서 배우는 매매 감각</div>
      <div style={{ position: 'absolute', bottom: 64, fontSize: 11, color: 'rgba(154,163,199,0.55)', opacity: 0, animation: 'chFade 0.6s ease 2s both' }}>탭해서 건너뛰기</div>
    </div>
  )
}
