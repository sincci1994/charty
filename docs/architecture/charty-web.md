# charty-web 아키텍처

> 작성 2026-08-24 (실측 기준), 2026-10-20 스피드 게임 반영. **낡는 조건**: 라우트·화면 추가, store 슬라이스 변경, 동기화 방식 변경 시 갱신할 것.
> 수치는 node_modules·.next·out·public/data 제외 실측: **소스 62파일 ~8,140줄** (프로덕션 TS/TSX ~6,100 + CSS 983 + 테스트 1,053, 2026-10-20 스피드 설정 반영 재측정).

## 한 문장 요약

서버 없는 Local-first SPA — **클라이언트가 진실의 원천**이고, 서버(Supabase)는 인증·덤 저장소·데이터 CDN만 맡는다.
Next.js App Router를 쓰지만 서버 컴포넌트 0개, 전 페이지 `'use client'`.

## 레이어 구조 (의존 방향은 아래로만)

```
app/            라우트 어댑터 15파일 — 대부분 2줄 re-export. 실질 로직은 shell.tsx(187줄) 하나
  └ shell.tsx   탭바·테마·SW등록·콜드스타트 스플래시·웰컴 게이트 + 인증/동기화 오케스트레이션
src/screens/    화면 12파일 ~2,450줄 (최대: Home 458 · Simulation 455 · Speed 303)
src/components/ 재사용 UI 13파일 ~1,460줄 (최대: NewsPanel 396 · SpeedChart·SpeedSettings는 스피드 전용, WealthGauge는 홈·스피드 공용)
src/store.ts    유일한 zustand 스토어 317줄 — 데이터 필드 11개(speedCfg는 기기 로컬, +비영속 syncError·syncing) + 액션 21개, persist v2
src/lib/        도메인 로직 10파일 ~1,410줄
  ├ engine.ts   체결·포지션·손익 139줄 — React·fetch·DOM 참조 0 (아래 '엔진' 참조)
  ├ data.ts     로더+상수+포맷터+지표+부 단계 사다리 285줄 (책임 혼재 — 300줄 넘으면 분할)
  ├ speed.ts    스피드 게임 고정값·설정 타입·빠른 조합·판정 순수 함수(익절·손절·마감)·출제(진입 자리 수 가중)·차트 y범위용 가까운 선 89줄
  ├ sync.ts     Supabase 동기화 170줄 (기록 병합 + LWW state·decideSync + 구독 디바운스 push)
  ├ report.ts   행동 리포트 344줄 (문장 생성까지 — 문구 규칙 집중이 의도)
  └ coach/fund/profile/supabase/nav
src/types.ts    전 도메인 타입 150줄 — import 0, 순수 리프. "스키마의 진실"
```

**의존 규칙 위반은 2가지뿐**: ① `store ↔ sync` 순환 1건(sync의 구독 패턴 탓 — 런타임 시점이 어긋나 실해는 없음),
② components 3개(OrderSheet·RiskSheet·CoachCard)가 store를 직접 참조.

## 핵심 데이터 흐름

```
[파이프라인] scripts/fetch-data.py (yfinance·SEC EDGAR·FRED·RSS·GDELT, 매일 KST 11시 cron)
      → Supabase Storage `data` 버킷 (CDN) → data.ts 로더 (15m/30m/4h은 클라이언트 리샘플)

[시뮬 루프] PracticeStyle → store.startSim(종목 적합 필터·pickRange)
      → Simulation [다음 캔들] → store.nextCandle → structuredClone → engine.fillOrders
      → OrderSheet → store.placeOrder → engine.validateOrder (체결은 다음 캔들에서 — 즉시 체결 없음)
      → Review → store.submitReview → SimRecord 적립 + sync.pushRecord (fire-and-forget)

[스피드 게임] Practice → /speed (첫 진입은 설정 카드 → store.speedCfg 기억, 이후 바로) → speed.pickRound(cfg: 시간봉·판정 캔들 수)
      → 롱/숏 탭 → store.playSpeed(진행 세션·대사 중이면 거부 · round.cfg로 speedOutcome 즉시 정산 · balance만 변경, 기록 없음)
      → 공개 애니메이션은 표시뿐 (정산 전 잔고로 보여주다 끝나면 반영). ⚙ 시트는 닫힐 때 한 번 적용 — 안 고른 판은 다시 뽑고, 아니면 다음 판부터

[동기화 2경로]
  기록: append-only, id 합집합 병합 (sync.reconcile — 순수 함수, 테스트 있음)
  상태: 유저당 1행 jsonb + 클라이언트 updated_at LWW. 비교·시드 정책은 sync.decideSync(순수 함수, 테스트 있음).
        balance는 더 이상 기록에서 파생되지 않는다(스피드 손익) — applySync는 '이 기기가 몰랐던 기록'이 최신일 때만 잔고를 따름.
        게스트 → 계정 로그인은 계정 우선: shell이 스탬프를 0으로 내려 state 행이 있으면 서버가 이기고, 행이 없으면(새 계정)
        리셋 전 스탬프(guestStamp)로 시드해 게스트 상태를 이어받는다(2026-10-20).
        대사 진행 중엔 store.syncing이 켜져 스피드 정산을 막는다(낡은 잔고 위의 탭이 다른 기기의 새 잔고를 덮지 않게, 5초 상한)
  안전장치: applyServer() 플래그 — 서버 반영 set을 사용자 변이로 오인해 되밀어내는 사고 방지
```

## 엔진 (src/lib/engine.ts)

- 공개 API 4개: `fillOrders` · `validateOrder` · `equity` · `forceCloseAll` (+ 상수 FX/FEE/CAP)
- 지정가 전용, 다음 캔들 저~고 관통 시 체결. 깊이 가중 참여율(`floor(v × depth × CAP)`) + 캔들당 체결 예산 선입선출 + 갭 체결(시가 유리 시 시가)
- 단위 규약: 가격 $, 현금·손익 ₩, 환전은 체결·평가 경계에서만 (FX=1400 고정 근사 — ponytail 표기됨)
- **순수하지만 in-place 변형** — "호출측에서 structuredClone 후 넘길 것" 계약이 주석으로만 존재(타입 미표현). store의 5개 액션 모두 준수 중
- SHORT 경로는 UI 진입 불가·구기록 재생용으로만 생존 (v1 마이그레이션이 잔여 세션 폐기)

## 테스트 (vitest 126케이스 — src/lib + store)

| 대상 | 케이스 | 비고 |
|---|--:|---|
| report | 21 | 에피소드·지표·잠금 게이트 |
| engine | 14 | 체결·평단·갭·검증 + **상수 부호 방어** |
| data / coach / fund | 18·9·9 | data에 부 단계 사다리(tierOf·tierProgress)·아바타 경계·단계×나이 그림 파일 존재 포함. coach는 자기 소스 `?raw` 스캔으로 블라인드 금지어 검사 |
| speed | 30 | 익절 통과/정확 터치/갭, 손절 터치/갭, 같은 캔들 둘 다(손절 먼저·시가 우선), 선 없음, 숏 −1 상한, 수수료 왕복, 선 표기·설정 비교, 가중 출제·가까운 선, 출제 자르기 경계(데이터 로더 mock) |
| sync | 11 | reconcile + 슬라이스 키 고정 + decideSync(LWW·시드 규칙·게스트 스탬프) |
| store | 14 | wipeLocal(speedCfg 유지), playSpeed(정산·판의 손절 규칙·진행 세션·대사 중·NaN 거부), applySync(잔고 채택 규칙·늦은 기록·시계 차) |

미커버: store의 나머지 액션·migrate, shell.tsx의 와이프·게스트 스탬프 리셋·대사 표시(beginSync), 컴포넌트 전부(React 테스트 인프라 없음).
**어떤 CI도 test/lint/typecheck를 돌리지 않는다** — daily.yml은 데이터 파이프라인 전용 (부채 ①).

## 빌드·배포 3타깃 (분기점은 코드 27줄이 전부)

| 타깃 | 진입 | 산출 |
|---|---|---|
| Vercel 웹/PWA | `next build` (git push 자동) | 서버 빌드 + sw.js(수제 47줄: static cache-first·HTML/데이터 network-first) |
| Android TWA | 웹 배포 그대로 | charty-android가 감쌈 — **웹 배포 = 앱 업데이트** |
| iOS Capacitor(예정) | `npm run build:cap` | 정적 export, data 21MB 제외, 데이터는 런타임 CDN |

분기: `next.config.ts`의 CAPACITOR 1줄 + `scripts/build-cap.mjs` 26줄. trailingSlash 여파로 shell.tsx에
pathname 끝슬래시 보정 1줄이 새어 있음(빌드 분기의 유일한 런타임 누출).

## 부채 대장 (2026-08-24 전수)

규율: TODO/FIXME **0건** — 의도적 단순화는 전부 `ponytail:` 주석(10건)으로 천장·업그레이드 경로를 명시.
목록·위치는 grep `ponytail:`이 항상 최신. 아래는 **조치 가치 순 상위 5개** (판단 포함):

| # | 부채 | 위험 | 상환 시점 제안 |
|---|---|---|---|
| ① | CI에 test/lint/typecheck 게이트 없음 | 126케이스가 있는데 자동 실행 0 — 회귀가 조용히 통과 | **즉시 가치.** daily.yml 옆 push 트리거 워크플로 하나 |
| ② | point-in-time 필터 3중 구현 (fund.ts·coach.ts·NewsPanel) | 미래 누출 방지 규칙이 "주석 합의"로 유지 — 한 곳만 `<=`로 바뀌면 조용히 깨짐 | 다음에 그 파일들 만질 때 헬퍼 1개로 통합 |
| ③ | ~~LWW 비교·시드 정책이 shell.tsx(UI)에 있고 미테스트~~ → 2026-10-20 `decideSync`로 내려 테스트함 (부분 상환) | 남은 것: 계정 전환 와이프·게스트 스탬프 리셋은 부작용이 있어 shell에 남음 | 다음 동기화 작업 때 |
| ④ | Welcome/AuthButtons Google OAuth 중복 (호출 2곳 + 로고 SVG 2벌) | 리다이렉트 정책 변경 시 한쪽 누락 | 다음 인증 작업 때 `lib/supabase.ts`로 승격 |
| ⑤ | 인라인 스타일 55% (디자인 .dc.html 이식 화면이 테마 변수 우회) | NewsPanel·Home 일부가 테마 3종 체계 밖 | 리팩터 대신 규칙: "이식 시 색은 var(--*)로" |

기타 소액: shell.tsx HashRouter 리다이렉트(시한부 — 삭제 예정 표기됨), lib/nav.tsx 24줄(react-router 잔재),
포맷터 분산(fmtD vs fmtUsd), 로컬 dist/(git 미추적 — 지워도 됨).

## 서버 신뢰 경계 (의도된 설계, 확장 시 재검토)

Supabase는 RLS만 있고 서버 검증 0 — 클라이언트가 잔고를 조작해 push하면 그대로 저장된다.
혼자 쓰는 모의투자라 수용. **리더보드·경쟁·결제가 생기는 순간 무너지는 경계**이므로 그 시점에
Edge Function 검증 도입 필요 (→ proposal.md).
