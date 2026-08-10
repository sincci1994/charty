import { useEffect, useState } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'

// R11 계정 — env 미설정이면 null: 로그인 UI가 숨고 앱은 기존 local-first 그대로 동작
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabase = url && anon ? createClient(url, anon, { auth: { flowType: 'pkce' } }) : null

// 활성화된 OAuth 제공자 목록 (공개 설정 엔드포인트) — 카카오를 대시보드에서 켜면 버튼이 자동으로 살아난다
export async function enabledProviders(): Promise<Set<string>> {
  if (!url || !anon) return new Set()
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } })
    const j: { external?: Record<string, boolean> } = await res.json()
    return new Set(Object.entries(j.external ?? {}).filter(([, on]) => on).map(([k]) => k))
  } catch {
    return new Set()
  }
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}
