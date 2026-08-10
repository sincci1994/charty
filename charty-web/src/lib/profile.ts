import { supabase } from './supabase'
import type { Profile } from '../types'

// R12 계정 프로필 — profiles 테이블(RLS 본인 것만). 프로필은 계정 전용이라 로컬 미러 없음.

interface Row {
  nickname: string
  age_band: string | null
  markets: string[] | null
  instruments: string[] | null
  style: string | null
  experience: string | null
}

export const rowToProfile = (r: Row): Profile => ({
  nickname: r.nickname,
  ageBand: r.age_band,
  markets: r.markets ?? [],
  instruments: r.instruments ?? [],
  style: r.style,
  experience: r.experience,
})

// null = 미로그인/미작성/실패 — 호출부는 "프로필 없음"으로 취급
export async function loadProfile(): Promise<Profile | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('profiles').select('nickname, age_band, markets, instruments, style, experience').maybeSingle()
    return error || !data ? null : rowToProfile(data as Row)
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
      markets: p.markets,
      instruments: p.instruments,
      style: p.style,
      experience: p.experience,
      updated_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}
