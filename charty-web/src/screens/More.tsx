import { useEffect, useRef, useState } from 'react'
import { useNav } from '../lib/nav'
import { useStore } from '../store'
import { supabase, useSession } from '../lib/supabase'
import { cachedProfile, loadProfile } from '../lib/profile'
import { applyServer, pickState, pullState, pushState, syncRecords } from '../lib/sync'
import AuthButtons from '../components/AuthButtons'
import { SKIP_SPLASH } from './Welcome'
import type { Profile } from '../types'

export default function More() {
  const nav = useNav()
  const { theme, setTheme, coach, setCoach, resetAll, syncError } = useStore()
  const session = useSession()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const logoutRef = useRef<HTMLDialogElement>(null)
  const [logout, setLogout] = useState<'' | 'busy' | 'fail'>('')
  // undefined = 로딩/미로그인, null = 프로필 미작성 (온보딩 CTA 강조용). 초기값은 로컬 미러(SWR — Home과 동일)
  const [profile, setProfile] = useState<Profile | null | undefined>(cachedProfile() ?? undefined)
  useEffect(() => {
    if (!session) return setProfile(cachedProfile() ?? undefined)
    let live = true
    loadProfile().then((p) => { if (live) setProfile(p) })
    return () => { live = false }
  }, [session])

  // 자발적 로그아웃만 이 기기의 계정 데이터를 지운다(세션 만료는 shell에서 안 지움 — 로컬이 유일본일 수 있다).
  // 지우기 전에 미동기화분을 서버로 밀어넣고, 둘 중 하나라도 실패하면 중단한다.
  // records는 '서버에 있으니 지워도 된다'의 근거이고, customs·activeSim은 state 행에만 있는 유일본이다
  const doLogout = async (force = false) => {
    setLogout('busy')
    if (!force) {
      const s = useStore.getState()
      if (!(await syncRecords(s.records))) return setLogout('fail')
      // state는 유저당 1행 LWW — 서버가 이미 같거나 더 새로우면 밀지 않는다.
      // 로그아웃은 변이가 없어도 push를 만들므로, 안 막으면 오래된 탭이 다른 기기의 최신 customs를 되돌린다
      const pulled = await pullState()
      if (pulled === 'error') return setLogout('fail')
      if (!(pulled && pulled.updatedAt >= s.stateUpdatedAt)
        && !(await pushState(pickState(s), s.stateUpdatedAt))) return setLogout('fail') // 2초 디바운스 대기분 포함
    }
    await supabase?.auth.signOut({ scope: 'local' }) // 이 기기만 — 기본값 global은 다른 기기 세션까지 끊는다
    applyServer(() => useStore.getState().wipeLocal()) // 구독자가 사용자 변이로 오인해 재푸시하는 것 차단
    localStorage.removeItem('charty:uid') // 남기면 이후 게스트 데이터가 계정 전환 가드에 지워진다
    localStorage.removeItem('charty:profile')
    try { sessionStorage.setItem(SKIP_SPLASH, '1') } catch { /* 저장소 불가 — 스플래시가 한 번 더 보일 뿐 */ }
    nav('/welcome', { replace: true })
  }

  const dark = (theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'

  return (
    <div className="page">
      <h2 style={{ padding: '12px 4px 0' }}>더보기</h2>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.374px' }}>차티</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #1fb6ff, #3d5cff)', borderRadius: 999, padding: '3px 9px' }}>베타</span>
        </div>
        <div className="dim" style={{ fontSize: 14, lineHeight: 1.55 }}>
          과거 캔들을 하나씩 넘기며 매매 습관을 훈련하는 모의투자 앱입니다.<br />
          {session ? '기록이 계정에 동기화되어 다른 기기에서도 이어집니다.' : '모든 데이터는 이 브라우저에만 저장됩니다.'}
        </div>
      </div>

      {supabase && (
        <>
          <div className="section-label">계정</div>
          <div className="card" style={{ gap: 10 }}>
            {session ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profile?.nickname ?? session.user.email ?? '로그인됨'}
                    </div>
                    <div className="dim" style={{ fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.user.app_metadata?.provider === 'kakao' ? '카카오' : 'Google'}
                      {profile?.nickname && session.user.email ? ` · ${session.user.email}` : ' 계정'} · {syncError ? '동기화 실패 — 새로고침 시 재시도' : '기록 자동 저장'}
                    </div>
                  </div>
                  <button className="pill pill-secondary" style={{ padding: '9px 14px', fontSize: 13 }} onClick={() => { setLogout(''); logoutRef.current?.showModal() }}>
                    로그아웃
                  </button>
                </div>
                <button
                  className={profile === null ? 'pill pill-primary' : 'pill pill-secondary'}
                  style={{ height: 40, fontSize: 13 }}
                  onClick={() => nav('/profile')}
                >
                  {profile === null ? '프로필 설정하기 — 닉네임·투자 성향' : '프로필 수정'}
                </button>
              </>
            ) : (
              <>
                <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  로그인하면 연습 기록이 계정에 저장되어<br />다른 기기에서도 이어서 볼 수 있어요.
                </div>
                <AuthButtons redirectPath="/more" />
              </>
            )}
          </div>
        </>
      )}

      <div className="section-label">설정</div>
      <div className="card setting-card">
        <div className="setting-row">
          <div className="setting-icon" style={{ background: 'linear-gradient(135deg, #1fb6ff, #3d5cff)' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 A9 9 0 1 0 12 21 C12 17 15 16 15 12 C15 8 12 7 12 3 Z" />
            </svg>
          </div>
          <div className="label">화면 테마</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['light', '라이트'], ['dark', '다크'], ['charty', '차티']] as const).map(([t, label]) => (
              <button
                key={t}
                className={`opt${(theme ?? (dark ? 'dark' : 'light')) === t ? ' selected' : ''}`}
                style={{ fontSize: 12, padding: '7px 12px', borderRadius: 999 }}
                onClick={() => setTheme(t)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-div" />
        <div className="setting-row">
          <div className="setting-icon" style={{ background: 'linear-gradient(135deg, #f5a623, #ff7a45)' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18 h6 M10 21 h4 M12 3 a6 6 0 0 1 4 10.5 c-.8.7-1 1.6-1 2.5 h-6 c0-.9-.2-1.8-1-2.5 A6 6 0 0 1 12 3 Z" />
            </svg>
          </div>
          <div className="label">AI 해석</div>
          <span className="dim" style={{ fontSize: 13 }}>{coach ? '켬' : '끔'}</span>
          <button className={coach ? 'switch on' : 'switch'} onClick={() => setCoach(!coach)} aria-label="AI 해석 켜고 끄기" />
        </div>
        <div className="setting-div" />
        <div className="setting-row" style={{ opacity: 0.7 }}>
          <div className="setting-icon" style={{ background: 'linear-gradient(135deg, #3d5cff, #9b2ff8)' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5 C6 4 8.5 4 12 5.5 C15.5 4 18 4 20 5 V19 C18 18 15.5 18 12 19.5 C8.5 18 6 18 4 19 Z M12 5.5 V19.5" />
            </svg>
          </div>
          <div className="label">사용법 가이드</div>
          <span className="badge">준비중</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6 L15 12 L9 18" />
          </svg>
        </div>
      </div>

      <div className="section-label">데이터 관리</div>
      <button className="card center" style={{ padding: '15px 16px' }} onClick={() => dialogRef.current?.showModal()}>
        <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.2px', color: 'var(--danger)' }}>전체 데이터 초기화</span>
      </button>

      <div className="dim center" style={{ fontSize: 12, marginTop: 16 }}>차티 v0.1.0</div>

      <dialog ref={logoutRef}>
        <h3>로그아웃할까요?</h3>
        <p>이 기기의 연습 기록과 자산이 지워집니다. 기록은 계정에 저장돼 다시 로그인하면 이어져요.</p>
        {logout === 'fail' && <p style={{ color: 'var(--danger)' }}>지금은 기록을 서버에 저장할 수 없어요. 연결을 확인해 주세요.</p>}
        <div className="actions">
          <button className="pill pill-secondary" disabled={logout === 'busy'} onClick={() => logoutRef.current?.close()}>취소</button>
          {logout === 'fail' ? (
            <button className="pill pill-danger" onClick={() => doLogout(true)}>그래도 로그아웃</button>
          ) : (
            <button className="pill pill-danger" disabled={logout === 'busy'} onClick={() => doLogout()}>
              {logout === 'busy' ? '저장 중…' : '로그아웃'}
            </button>
          )}
        </div>
      </dialog>

      <dialog ref={dialogRef}>
        <h3>모든 기록과 자산을 초기화할까요?</h3>
        <p>되돌릴 수 없습니다.</p>
        <div className="actions">
          <button className="pill pill-secondary" onClick={() => dialogRef.current?.close()}>취소</button>
          <button className="pill pill-danger" onClick={() => { dialogRef.current?.close(); resetAll() }}>초기화</button>
        </div>
      </dialog>
    </div>
  )
}
