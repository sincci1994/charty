import { supabase } from './supabase'
import type { SimRecord } from '../types'

// R11 기록 동기화 — 서버(records 테이블)는 JSONB 덤 저장소, 스키마의 진실은 클라이언트.
// 기록이 append-only·uuid 키라 병합 = id 합집합이면 끝, 충돌 해결이 필요 없다.
// 모든 IO는 실패해도 조용히 로컬 유지 — 다음 대사(로그인·새로고침)가 다시 밀어준다.

export function reconcile(local: SimRecord[], server: SimRecord[]): { merged: SimRecord[]; toPush: SimRecord[] } {
  const serverIds = new Set(server.map((r) => r.id))
  const localIds = new Set(local.map((r) => r.id))
  return {
    merged: [...local, ...server.filter((r) => !localIds.has(r.id))].sort((a, b) => b.endedAt - a.endedAt),
    toPush: local.filter((r) => !serverIds.has(r.id)),
  }
}

const row = (userId: string, r: SimRecord) => ({ id: r.id, user_id: userId, ended_at: new Date(r.endedAt).toISOString(), data: r })

// 전체 대사: pull → 누락분 push → 병합 반환. null = 미로그인/실패(호출부는 로컬 유지)
export async function syncRecords(local: SimRecord[]): Promise<SimRecord[] | null> {
  if (!supabase) return null
  try {
    const { data: s } = await supabase.auth.getSession()
    const userId = s.session?.user.id
    if (!userId) return null
    const { data, error } = await supabase.from('records').select('data')
    if (error) return null
    const server = (data as { data: SimRecord }[]).map((r) => r.data)
    const { merged, toPush } = reconcile(local, server)
    if (toPush.length)
      await supabase.from('records').upsert(toPush.map((r) => row(userId, r)), { onConflict: 'id', ignoreDuplicates: true })
    return merged
  } catch {
    return null
  }
}

// 회고 저장 직후 1건 push (fire-and-forget) — 실패분은 다음 syncRecords가 수습
export async function pushRecord(r: SimRecord): Promise<void> {
  if (!supabase) return
  try {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return
    await supabase.from('records').upsert([row(s.session.user.id, r)], { onConflict: 'id', ignoreDuplicates: true })
  } catch { /* 오프라인 등 — 무시 */ }
}

// 전체 초기화 시 서버 기록도 삭제 — 안 지우면 다음 로그인 때 부활해 초기화가 무의미해진다
export async function clearRemote(): Promise<void> {
  if (!supabase) return
  try {
    const { data: s } = await supabase.auth.getSession()
    if (s.session) await supabase.from('records').delete().eq('user_id', s.session.user.id)
  } catch { /* 실패 시 다음 로그인 때 기록이 되살아남 — 드문 케이스로 수용 */ }
}
