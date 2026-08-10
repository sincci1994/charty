# 2026-08-10 — R10 재무 탭 + R11 계정·동기화 + R12 온보딩·프로필

## 작업 개요

하루에 세 기능: **R10 재무 정보 탭**(SEC EDGAR, 공시일 기준 point-in-time), **R11 Google 로그인 + 기록 동기화**(Supabase Auth·RLS), **R12 첫 방문 온보딩 + 계정 프로필**. 부수로 UI 라벨 한국어 통일, Vercel 통합 env 함정 우회. 전 기능 실계정 e2e 검증 완료.

## 커밋 내역

| 해시 | 내용 |
|---|---|
| `bf69fe6` | **R10 재무 정보 탭 + UI 라벨 한국어 통일** — `fetch-data.py` EDGAR 섹션(companyfacts, 최초 공시 dedup, 기간 길이로 분기 판별, Q4 = FY−ΣQ1..3 파생, **EPS 분할 조정** — 캔들이 yfinance 조정가라 미보정 시 PER 4~28배 왜곡), `fundamentals.json`(4종목 66~76분기, ~15KB), `fund.ts` 파생 계산(공시일 필터·상대 분기 라벨·흑자전환/적자전환/적자지속·PER TTM), `FundPanel` + 시뮬 3번째 탭 [재무], R6 이벤트 `fund` + R7 `newsFollowups` 오염 방지 가드. 영어 라벨 11곳 한국어화(금융 약어 PER·EMA·RSI는 유지) |
| `3f54320` | **R11·R12** — `supabase.ts`(PKCE, env 미설정 시 null → UI 숨김), `sync.ts`(records JSONB·id 합집합 병합·로그인 시 전체 대사 + 회고 저장 push + 초기화 시 서버 삭제), `profiles` 테이블, `/welcome`(첫 방문 게이트, 둘러보기 허용 = Local-first 유지), `/profile`(온보딩·수정 겸용, 닉네임만 필수), 더보기 계정 카드, 카카오 버튼은 공개 설정 읽어 자동 활성화 |
| `774f1af` | **Vercel 통합 env 선점 우회** — `NEXT_PUBLIC_SB_*` 우선 읽기 (아래 환경변수 절 참조) |

## 검증 (전부 실측)

- R10: EDGAR 4사 실호출로 태그 존재·10-K/A 중복·분기/누적 혼재 확인, 분할 카나리아 2개(÷4·÷28), AAPL 2016-01 세션에서 PER 9.5(당시 실제와 일치)·분기 매출 4개 공시값 일치, **공시일 경계 통과 시 새 분기 등장 + NEW 배지** 확인
- R11: Google OAuth 왕복(로컬), 기록 push/pull/RLS/삭제 e2e, 익명 접근 차단
- R12: 프로필 저장 실계정 확인(신성철·30대·해외주식·현물·스윙·3년 이상), 웰컴 게이트(로그인 상태 자동 통과), 더보기 CTA 전환
- 프로덕션: Google 로그인 동작 확인(사용자), 재무 데이터는 08-10 밤 CI 업로드 예정

## 환경변수 현황 — ⚠️ 주의사항과 정리 절차

### 현재 상태 (3계층 + 통합 주입)

| 위치 | 변수 | 값이 가리키는 곳 | 상태 |
|---|---|---|---|
| 로컬 `.env.local` | `NEXT_PUBLIC_DATA_URL` | vfiuzh… Storage | 정상 |
| 로컬 `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` | **vfiuzh…(진짜)** | 정상 — 코드가 폴백으로 읽음 |
| 로컬 `.env.local` 주석 | `SUPABASE_SERVICE_KEY`(sb_secret) | vfiuzh… | 🔒 비밀 — 파이프라인 수동 실행용 |
| Vercel 수동 | `NEXT_PUBLIC_DATA_URL` | vfiuzh… Storage | 정상 |
| Vercel **통합 주입(수정 불가)** | `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 외 다수(`POSTGRES_*` 등) | **krfdsexdkqdzcztihrci(미사용 프로젝트!)** | ⚠️ 함정의 근원 |
| Vercel 수동 | `NEXT_PUBLIC_SB_URL`/`SB_ANON_KEY` | **vfiuzh…(진짜)** | 정상 — 코드가 **우선** 읽음 |
| GitHub Secrets | `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` | vfiuzh… | 🔒 정상 — daily CI용 |

코드 읽기 순서(`src/lib/supabase.ts`): `NEXT_PUBLIC_SB_* ?? NEXT_PUBLIC_SUPABASE_*` — Vercel에선 SB_*가 이기고, 로컬은 SB_* 없이 기존 이름 폴백.

### 주의할 것

1. **최대 리스크**: 나중에 "Vercel에 SUPABASE_* 있네?" 하고 `NEXT_PUBLIC_SB_*`를 지우면 프로덕션이 **조용히 옛 프로젝트로 되돌아가** 로그인이 깨진다(빌드는 성공, 런타임에서만 "provider is not enabled"). SB_*는 통합을 정리하기 전까지 절대 삭제 금지.
2. **키 등급 구분**: `sb_publishable_`(anon)은 공개 전제 — 번들에 박히는 게 정상이고 RLS가 방어선. `sb_secret_`(service)은 RLS를 무시하는 전권 키 — 절대 프런트/레포에 넣지 않는다(현재 GH Secrets + .env.local 주석에만 존재 = 정상).
3. `NEXT_PUBLIC_*`는 **빌드 타임 인라인** — Vercel에서 값을 바꾸면 저장만으로 반영 안 되고 **Redeploy 필수**.
4. 통합이 붙어 있는 한 krfdsex 값들은 계속 주입됨 — Vercel UI에서 수정·삭제 불가, 새 이름 우회가 유일한 해법(현 상태).
5. 2026-08-10 세션 채팅에 Google OAuth **client secret**이 노출됨 — Google Cloud Console에서 재발급(rotate) 후 Supabase provider에 갱신 권장.

### 정리 절차 (여유 있을 때, 순서대로)

1. **사전 확인**: Supabase 대시보드에서 `krfdsexdkqdzcztihrci` 프로젝트 열어 Table Editor·Storage가 비어있는지 확인 (예상: 통합이 자동 생성한 빈 프로젝트)
2. **통합 제거**: Vercel → Settings → Integrations → Supabase → Remove — 주입 변수 전부 소멸. **실데이터 프로젝트(vfiuzh…)는 이 통합과 연결돼 있지 않아 영향 없음.** 단, 마켓플레이스 경유 생성이었다면 krfdsex 프로젝트 자체가 함께 삭제될 수 있음 — 그래서 1번 확인이 먼저
3. **변수 정리** — 둘 중 하나:
   - **현행 유지(권장·무수정)**: `NEXT_PUBLIC_SB_*` 그대로 두면 끝. 코드·배포 변경 없음
   - 이름 통일(정석): 통합 제거로 이름이 비었으니 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`를 수동 추가 → `supabase.ts`의 SB_* 우선 읽기 제거 → SB_* 변수 삭제 → Redeploy
4. **Redeploy 후 로그인 확인** (배포판 더보기 → Google)
5. krfdsex 프로젝트가 남아있으면 Supabase에서 삭제
6. (보안) Google client secret 재발급 → Supabase Google provider 갱신

## 남은 것

- **카카오 로그인**: Kakao Developers 앱 + Supabase provider 등록만 하면 버튼 자동 활성화 (이메일 동의항목 = 개인 개발자 비즈 앱 전환 필요)
- **재무 데이터 첫 업로드**: 08-10 밤 cron 또는 GitHub 웹 UI에서 daily 수동 실행
- R10 알려진 한계(코드 주석에 명시): filed는 날짜 단위(자정 UTC), 파생 Q4 EPS 근사, 배당 조정으로 과거 PER 수% 과소, '기간말~공시 사이 분할' 미처리(4종목 이력엔 없음 — 종목 추가 시 재검토)
