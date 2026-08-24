import { useEffect, useState } from 'react'
import { useNav } from '../lib/nav'
import { AGE_BANDS, EXPERIENCES, GENDERS, INSTRUMENTS, INVEST_STYLES, MARKETS } from '../types'
import { loadProfile, saveProfile } from '../lib/profile'
import { supabase, useSession } from '../lib/supabase'

// R12 계정 프로필 — 온보딩(로그인 직후 redirectTo)과 수정(더보기) 겸용.
// 필수는 닉네임뿐 — 주문 마찰 최소 원칙(R5)과 같은 이유로 나머지는 전부 선택.

const chip: React.CSSProperties = { height: 40, borderRadius: 999, fontSize: 13, padding: 0 }

function Chips({ options, cols, isOn, onPick }: { options: readonly string[]; cols: number; isOn: (v: string) => boolean; onPick: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
      {options.map((v) => (
        <button key={v} className={`opt${isOn(v) ? ' selected' : ''}`} style={chip} onClick={() => onPick(v)}>
          {v}
        </button>
      ))}
    </div>
  )
}

const Label = ({ text, optional }: { text: string; optional?: boolean }) => (
  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px', marginTop: 14 }}>
    {text} {optional && <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>선택</span>}
  </div>
)

export default function Profile() {
  const nav = useNav()
  const session = useSession()
  const [ready, setReady] = useState(false) // 세션 판별 유예 — 미로그인 안내 플래시 방지
  const [loaded, setLoaded] = useState(false)
  const [isNew, setIsNew] = useState(true)
  const [nickname, setNickname] = useState('')
  const [ageBand, setAgeBand] = useState<string | null>(null)
  const [gender, setGender] = useState<string | null>(null)
  const [markets, setMarkets] = useState<string[]>([])
  const [instruments, setInstruments] = useState<string[]>([])
  const [style, setStyle] = useState<string | null>(null)
  const [experience, setExperience] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 800)
    return () => clearTimeout(t)
  }, [])

  // 세션 준비 후 1회 로드 — 기존 프로필이면 프리필(수정 모드), 없으면 구글 이름 프리필(온보딩)
  useEffect(() => {
    if (!session || loaded) return
    loadProfile().then((p) => {
      if (p) {
        setIsNew(false)
        setNickname(p.nickname)
        setAgeBand(p.ageBand)
        setGender(p.gender)
        setMarkets(p.markets)
        setInstruments(p.instruments)
        setStyle(p.style)
        setExperience(p.experience)
      } else {
        setNickname(((session.user.user_metadata?.name as string | undefined) ?? session.user.email?.split('@')[0] ?? '').slice(0, 20))
      }
      setLoaded(true)
    })
  }, [session, loaded])

  if (!supabase || (ready && !session))
    return (
      <div className="page">
        <div className="card empty" style={{ minHeight: 200, justifyContent: 'center' }}>로그인 후 이용할 수 있어요</div>
        <button className="pill pill-secondary" onClick={() => nav('/more')}>더보기로 가기</button>
      </div>
    )
  if (!loaded) return <div className="page"><div className="empty">불러오는 중…</div></div>

  const toggleMulti = (arr: string[], set: (v: string[]) => void) => (v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const toggleOne = (cur: string | null, set: (v: string | null) => void) => (v: string) => set(cur === v ? null : v)

  const save = async () => {
    setSaving(true)
    setErr(false)
    const ok = await saveProfile({ nickname: nickname.trim(), ageBand, gender, markets, instruments, style, experience })
    setSaving(false)
    if (ok) nav(isNew ? '/' : '/more', { replace: true })
    else setErr(true)
  }

  return (
    <div className="page">
      <h2 style={{ padding: '12px 4px 0' }}>{isNew ? '프로필 설정' : '프로필 수정'}</h2>
      <div className="dim" style={{ fontSize: 13, padding: '0 4px' }}>
        닉네임만 필수예요 — 나머지는 나중에 채워도 됩니다.
      </div>

      <Label text="닉네임" />
      <input
        type="text"
        value={nickname}
        maxLength={20}
        placeholder="닉네임을 입력하세요"
        onChange={(e) => setNickname(e.target.value)}
        style={{ height: 48, borderRadius: 12, border: '1px solid var(--hairline)', background: 'var(--card)', fontSize: 14, padding: '0 16px' }}
      />

      <Label text="연령대" optional />
      <Chips options={AGE_BANDS} cols={3} isOn={(v) => ageBand === v} onPick={toggleOne(ageBand, setAgeBand)} />

      <Label text="성별" optional />
      <Chips options={GENDERS} cols={2} isOn={(v) => gender === v} onPick={toggleOne(gender, setGender)} />

      <Label text="주요 투자 시장" optional />
      <Chips options={MARKETS} cols={3} isOn={(v) => markets.includes(v)} onPick={toggleMulti(markets, setMarkets)} />

      <Label text="주로 거래하는 상품" optional />
      <Chips options={INSTRUMENTS} cols={3} isOn={(v) => instruments.includes(v)} onPick={toggleMulti(instruments, setInstruments)} />

      <Label text="투자 스타일" optional />
      <Chips options={INVEST_STYLES} cols={3} isOn={(v) => style === v} onPick={toggleOne(style, setStyle)} />

      <Label text="투자 경력" optional />
      <Chips options={EXPERIENCES} cols={2} isOn={(v) => experience === v} onPick={toggleOne(experience, setExperience)} />

      <button
        className="pill pill-full pill-primary"
        style={{ marginTop: 20 }}
        disabled={!nickname.trim() || saving}
        onClick={save}
      >
        {saving ? '저장 중…' : '저장하기'}
      </button>
      {err && <div className="center" style={{ fontSize: 12, color: 'var(--red)' }}>저장에 실패했어요 — 잠시 후 다시 시도해주세요</div>}
      {isNew && (
        <button className="dim center" style={{ background: 'transparent', fontSize: 13, padding: '6px 0' }} onClick={() => nav('/', { replace: true })}>
          나중에 하기
        </button>
      )}
    </div>
  )
}
