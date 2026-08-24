import { supabase } from './supabase'
import { useStore } from '../store'
import type { ActiveSim, CustomStyle, SimRecord } from '../types'

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
    if (error) { console.warn('[sync]', error); return null }
    const server = (data as { data: SimRecord }[]).map((r) => r.data)
    const { merged, toPush } = reconcile(local, server)
    if (toPush.length) {
      // 에러를 안 보면 push 실패에도 merged를 돌려주게 된다 — 로그아웃 플러시가 그 반환값을 믿고 로컬을 지운다
      const { error: pushErr } = await supabase.from('records').upsert(toPush.map((r) => row(userId, r)), { onConflict: 'id', ignoreDuplicates: true })
      if (pushErr) { console.warn('[sync]', pushErr); return null }
    }
    return merged
  } catch (e) {
    console.warn('[sync]', e)
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
  } catch (e) { console.warn('[sync]', e) /* 오프라인 등 — 다음 대사가 수습 */ }
}

// 전체 초기화 시 서버 기록·상태도 삭제 — 안 지우면 다음 로그인 때 부활해 초기화가 무의미해진다.
// state 행은 삭제 직후 구독자가 초기화된 상태를 새 타임스탬프로 재푸시 → 다른 기기도 LWW로 초기화됨
export async function clearRemote(): Promise<void> {
  if (!supabase) return
  try {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return
    await supabase.from('records').delete().eq('user_id', s.session.user.id)
    await supabase.from('state').delete().eq('user_id', s.session.user.id)
  } catch (e) { console.warn('[sync]', e) /* 실패 시 다음 로그인 때 되살아남 — 드문 케이스로 수용 */ }
}

// ── R13 상태 동기화 — 잔고·진행 세션·커스텀은 "현재 값" 하나뿐이라 유저당 1행 LWW ──
// updated_at은 클라이언트 변이 시각. 한 사람이 두 기기에서 동시에 자산을 굴릴 수 없으므로
// ponytail: LWW로 충분 — 더 새로운 서버 state가 진행 중 로컬 세션을 밀어내는 건 의도된 동작, 머지 로직 없음

// welcomed는 동기화하지 않는다 — 기기 로컬 게이트다(theme·coach와 같은 부류).
// 슬라이스에 넣으면 로그아웃 와이프 직후 /welcome 버튼 한 번이 '내용은 빈' 슬라이스에 최신 스탬프를 찍어
// 재로그인 때 서버의 진짜 customs·activeSim을 이겨버린다. 다른 기기 중복 노출은 게이트의
// records.length === 0 조건과 Welcome의 세션 리다이렉트가 이미 막는다
export interface SyncedState {
  balance: number
  activeSim: ActiveSim | null
  customs: CustomStyle[]
  waitlistAt: number | null
}

export const pickState = (s: SyncedState): SyncedState =>
  ({ balance: s.balance, activeSim: s.activeSim, customs: s.customs, waitlistAt: s.waitlistAt })

// false = 미로그인/실패. customs·activeSim은 records에서 파생 불가라 state 행이 유일본 —
// 로그아웃처럼 '올린 뒤 지우는' 호출부는 이 반환값을 반드시 확인해야 한다
export async function pushState(data: SyncedState, updatedAt: number): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return false
    const { error } = await supabase.from('state')
      .upsert({ user_id: s.session.user.id, data, updated_at: new Date(updatedAt).toISOString() })
    if (error) { console.warn('[sync]', error); return false }
    return true
  } catch (e) { console.warn('[sync]', e); return false /* 로컬이 newer로 남아 다음 변이·로그인 때 재푸시 */ }
}

// null = 행 없음(첫 로그인 — 호출부가 시드 push), 'error' = 실패(호출부가 syncError 표시)
export async function pullState(): Promise<{ data: SyncedState; updatedAt: number } | null | 'error'> {
  if (!supabase) return null
  try {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return null
    const { data, error } = await supabase.from('state').select('data, updated_at').maybeSingle()
    if (error) { console.warn('[sync]', error); return 'error' }
    if (!data) return null
    return { data: data.data as SyncedState, updatedAt: new Date(data.updated_at as string).getTime() }
  } catch (e) { console.warn('[sync]', e); return 'error' }
}

// 푸시 트리거: 스토어 구독 1개 — 모든 변이가 set()을 지나므로 12개 액션에 개별 훅이 필요 없다.
// 변이 감지 즉시 stateUpdatedAt 스탬프(푸시 성공 여부와 무관 — 실패 시 로컬이 newer로 남아 자가 치유),
// 실제 푸시는 트레일링 2초 디바운스 (nextCandle 연타 대응)
let inited = false
let lastPushed: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let applying = false

// 서버 반영·와이프용 래퍼 — 구독자가 이 안의 set()을 사용자 변이로 오인해 스탬프·재푸시하면
// LWW 비교가 오염된다(신규 기기가 서버 state를 영영 못 받고 빈 상태로 덮어쓰는 사고의 근원)
export function applyServer(fn: () => void): void {
  applying = true
  try { fn() } finally { applying = false }
}

// 와이프 직후 남은 예약 push 취소. applyServer는 '새 예약'만 막고 이미 무장된 타이머는 못 막는다 —
// pushState의 getSession 재확인이 보통 막아주지만, 로그아웃 후 2초 안에 다시 로그인하면 그 방어가 뚫린다
export function cancelPush(): void {
  clearTimeout(timer)
  timer = undefined
}

export function initStateSync(): void {
  if (inited) return
  inited = true
  lastPushed = JSON.stringify(pickState(useStore.getState()))
  useStore.subscribe((state, prev) => {
    // 서버 반영(applyServer) 또는 스탬프 자체의 set — 푸시 유발 금지, 비교 기준만 갱신
    if (applying || state.stateUpdatedAt !== prev.stateUpdatedAt) {
      lastPushed = JSON.stringify(pickState(state))
      return
    }
    const snap = JSON.stringify(pickState(state))
    if (snap === lastPushed) return
    lastPushed = snap
    useStore.setState({ stateUpdatedAt: Date.now() })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const s = useStore.getState()
      void pushState(pickState(s), s.stateUpdatedAt)
    }, 2000)
  })
}
