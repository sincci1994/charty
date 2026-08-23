# charty-web 아키텍처

> 작성 2026-08-24 (실측 기준). **낡는 조건**: 라우트·화면 추가, store 슬라이스 변경, 동기화 방식 변경 시 갱신할 것.
> 수치는 node_modules·.next·out·public/data 제외 실측: **소스 37파일 ~6,840줄** (프로덕션 TS/TSX ~5,280 + CSS 954 + 테스트 599).

## 한 문장 요약

서버 없는 Local-first SPA — **클라이언트가 진실의 원천**이고, 서버(Supabase)는 인증·덤 저장소·데이터 CDN만 맡는다.
Next.js App Router를 쓰지만 서버 컴포넌트 0개, 전 페이지 `'use client'`.

## 레이어 구조 (의존 방향은 아래로만)

```
app/            라우트 어댑터 14파일 — 대부분 2줄 re-export. 실질 로직은 shell.tsx(152줄) 하나
  └ shell.tsx   탭바·테마·SW등록·콜드스타트 스플래시·웰컴 게이트 + 인증/동기화 오케스트레이션
src/screens/    화면 11파일 ~1,910줄 (최대: Simulation 455 · Home 450)
src/components/ 재사용 UI 10파일 ~1,290줄 (최대: NewsPanel 396)
src/store.ts    유일한 zustand 스토어 271줄 — 데이터 필드 10개 + 액션 18개, persist v2
src/lib/        도메인 로직 9파일 ~1,140줄
  ├ engine.ts   체결·포지션·손익 139줄 — React·fetch·DOM 참조 0 (아래 '엔진' 참조)
  ├ data.ts     로더+상수+포맷터+지표 264줄 (책임 5개 혼재 — 응집도 낮음, 아직 견딤)
  ├ sync.ts     Supabase 동기화 135줄 (기록 병합 + LWW state + 구독 디바운스 push)
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

[동기화 2경로]
  기록: append-only, id 합집합 병합 (sync.reconcile — 순수 함수, 테스트 있음)
  상태: 유저당 1행 jsonb + 클라이언트 updated_at LWW. 비교 정책은 shell.tsx:109-120에 있음(부채 ③)
  안전장치: applyServer() 플래그 — 서버 반영 set을 사용자 변이로 오인해 되밀어내는 사고 방지
```

## 엔진 (src/lib/engine.ts)

- 공개 API 4개: `fillOrders` · `validateOrder` · `equity` · `forceCloseAll` (+ 상수 FX/FEE/CAP)
- 지정가 전용, 다음 캔들 저~고 관통 시 체결. 깊이 가중 참여율(`floor(v × depth × CAP)`) + 캔들당 체결 예산 선입선출 + 갭 체결(시가 유리 시 시가)
- 단위 규약: 가격 $, 현금·손익 ₩, 환전은 체결·평가 경계에서만 (FX=1400 고정 근사 — ponytail 표기됨)
- **순수하지만 in-place 변형** — "호출측에서 structuredClone 후 넘길 것" 계약이 주석으로만 존재(타입 미표현). store의 5개 액션 모두 준수 중
- SHORT 경로는 UI 진입 불가·구기록 재생용으로만 생존 (v1 마이그레이션이 잔여 세션 폐기)

## 테스트 (vitest 63케이스, 전부 src/lib 대상)

| 대상 | 케이스 | 비고 |
|---|--:|---|
| report | 19 | 에피소드·지표·잠금 게이트 |
| engine | 11 | 체결·평단·갭·검증 + **상수 부호 방어** |
| data / coach / fund | 12·9·9 | coach는 자기 소스 `?raw` 스캔으로 블라인드 금지어 검사 |
| sync | 3 | **reconcile만** — LWW·구독·플래그는 미테스트 (부채 ③) |

미커버: store.ts 전체(액션 18개·migrate), shell.tsx의 와이프·시드 조건, 컴포넌트 전부(React 테스트 인프라 없음).
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
| ① | CI에 test/lint/typecheck 게이트 없음 | 63케이스가 있는데 자동 실행 0 — 회귀가 조용히 통과 | **즉시 가치.** daily.yml 옆 push 트리거 워크플로 하나 |
| ② | point-in-time 필터 3중 구현 (fund.ts·coach.ts·NewsPanel) | 미래 누출 방지 규칙이 "주석 합의"로 유지 — 한 곳만 `<=`로 바뀌면 조용히 깨짐 | 다음에 그 파일들 만질 때 헬퍼 1개로 통합 |
| ③ | LWW 비교·시드 정책이 shell.tsx(UI)에 있고 미테스트 | 가장 사고 이력 많은 코드(applying/wiping)가 테스트 밖 | sync.ts로 내려 순수 함수화 → 테스트 |
| ④ | Welcome/AuthButtons Google OAuth 중복 (호출 2곳 + 로고 SVG 2벌) | 리다이렉트 정책 변경 시 한쪽 누락 | 다음 인증 작업 때 `lib/supabase.ts`로 승격 |
| ⑤ | 인라인 스타일 55% (디자인 .dc.html 이식 화면이 테마 변수 우회) | NewsPanel·Home 일부가 테마 3종 체계 밖 | 리팩터 대신 규칙: "이식 시 색은 var(--*)로" |

기타 소액: shell.tsx HashRouter 리다이렉트(시한부 — 삭제 예정 표기됨), lib/nav.tsx 24줄(react-router 잔재),
포맷터 분산(fmtD vs fmtUsd), 로컬 dist/(git 미추적 — 지워도 됨).

## 서버 신뢰 경계 (의도된 설계, 확장 시 재검토)

Supabase는 RLS만 있고 서버 검증 0 — 클라이언트가 잔고를 조작해 push하면 그대로 저장된다.
혼자 쓰는 모의투자라 수용. **리더보드·경쟁·결제가 생기는 순간 무너지는 경계**이므로 그 시점에
Edge Function 검증 도입 필요 (→ proposal.md).
