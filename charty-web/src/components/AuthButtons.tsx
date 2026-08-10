import { useEffect, useState } from 'react'
import { enabledProviders, supabase } from '../lib/supabase'

// R11·R12 소셜 로그인 버튼 (카카오: #FEE500 + 검정 심벌 / Google: 흰 배경 + 4색 G, 각 브랜드 가이드 준수)
// 카카오는 Supabase 설정을 읽어 활성화되면 자동으로 살아난다 — 대시보드에서 켜는 순간 코드 수정 없이 동작

const KakaoLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#191919">
    <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.25 4.64 6.65l-.95 3.54c-.08.31.27.56.54.38l4.18-2.8c.52.07 1.05.11 1.59.11 5.52 0 10-3.54 10-7.88S17.52 3 12 3Z" />
  </svg>
)
const GoogleLogo = () => (
  <svg width="15" height="15" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

const btn: React.CSSProperties = {
  height: 46, borderRadius: 12, fontWeight: 600, fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}

export default function AuthButtons({ redirectPath, beforeSignIn }: { redirectPath: string; beforeSignIn?: () => void }) {
  const [providers, setProviders] = useState<Set<string>>(new Set(['google'])) // 낙관적 기본 — 구글은 활성 확인됨
  useEffect(() => {
    enabledProviders().then(setProviders)
  }, [])
  const signIn = (provider: 'kakao' | 'google') => {
    beforeSignIn?.()
    supabase?.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}${redirectPath}` } })
  }
  const kakaoOn = providers.has('kakao')
  return (
    <>
      <button
        style={{ ...btn, background: '#FEE500', color: '#191919', opacity: kakaoOn ? 1 : 0.45 }}
        disabled={!kakaoOn}
        onClick={() => signIn('kakao')}
      >
        <KakaoLogo /> 카카오로 계속하기{kakaoOn ? '' : ' (준비중)'}
      </button>
      <button style={{ ...btn, background: '#fff', color: '#1f1f1f', border: '1px solid var(--hairline)' }} onClick={() => signIn('google')}>
        <GoogleLogo /> Google로 계속하기
      </button>
    </>
  )
}
