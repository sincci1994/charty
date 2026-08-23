import { supabase } from './supabase'
import type { Profile } from '../types'

// R12 계정 프로필 — profiles 테이블(RLS 본인 것만). 프로필은 계정 전용이라 로컬 미러 없음.

interface Row {
  nickname: string
  age_band: string | null
  gender: string | null
  markets: string[] | null
  instruments: string[] | null
  style: string | null
  experience: string | null
}

export const rowToProfile = (r: Row): Profile => ({
  nickname: r.nickname,
  ageBand: r.age_band,
  gender: r.gender,
  markets: r.markets ?? [],
  instruments: r.instruments ?? [],
  style: r.style,
  experience: r.experience,
})

// 로컬 미러 — 인사말 닉네임 등이 네트워크 왕복을 기다리며 늦게 뜨는 팝인 방지(stale-while-revalidate).
// uid를 같이 저장해 계정 전환 시 이전 계정 프로필이 잠깐 보이는 것을 차단 (charty:uid는 shell이 관리)
const MIRROR = 'charty:profile'

export function cachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(MIRROR)
    if (!raw) return null
    const { uid, profile } = JSON.parse(raw) as { uid: string; profile: Profile }
    return uid && uid === localStorage.getItem('charty:uid') ? profile : null
  } catch {
    return null // SSR 프리렌더·저장소 접근 불가 — 미러 없이 기존 동작
  }
}

function mirror(p: Profile | null) {
  try {
    const uid = localStorage.getItem('charty:uid')
    if (!uid) return
    if (p) localStorage.setItem(MIRROR, JSON.stringify({ uid, profile: p }))
    else localStorage.removeItem(MIRROR)
  } catch { /* 미러 실패는 무해 — 다음 fetch가 대체 */ }
}

// null = 미로그인/미작성/실패 — 호출부는 "프로필 없음"으로 취급
export async function loadProfile(): Promise<Profile | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('profiles').select('nickname, age_band, gender, markets, instruments, style, experience').maybeSingle()
    if (error) return null // 일시 오류 — 미러는 유지 (성공 응답만 미러에 반영)
    const p = data ? rowToProfile(data as Row) : null
    mirror(p)
    return p
  } catch {
    return null
  }
}

export async function saveProfile(p: Profile): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return false
    const { error } = await supabase.from('profiles').upsert({
      user_id: s.session.user.id,
      nickname: p.nickname,
      age_band: p.ageBand,
      gender: p.gender,
      markets: p.markets,
      instruments: p.instruments,
      style: p.style,
      experience: p.experience,
      updated_at: new Date().toISOString(),
    })
    if (!error) mirror(p)
    return !error
  } catch {
    return false
  }
}
