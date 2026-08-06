# 2026-08-06 — Next.js 전환 + Supabase Storage 파이프라인 + GitHub Actions

## 작업 개요

Vite SPA를 **Next.js 16(App Router)** 로 전환하고, 데이터 파이프라인을 **Supabase Storage**로 이관해 **GitHub Actions 일일 cron**으로 자동화. 세션 유실 후 git 이력·CI·버킷 실측으로 재구성한 기록.
커밋 5개(08-05~08-06), working tree clean, CI 마지막 실행 **success**, 버킷 적재 확인 완료.

## 커밋 내역

| 해시 | 내용 |
|---|---|
| `955c00a` | **GDELT 429 대응** — 재시도 고정 30s → 지수 백오프(60·120·240s). 실패 주 `[]` → `None` 반환으로 바꿔 호출부가 진행분 저장 후 break (이전엔 실패 주를 건너뛰어 영구 유실). 주간 요청 간격 7→10초 |
| `567b195` | **Vite → Next.js 16(App Router) 전환** — 화면 코드 무수정 최소 이전. 상세 아래 |
| `377f7e7` | **파이프라인 Supabase Storage 이관 + Actions** — `save()` 헬퍼, `daily.yml` 신규. 상세 아래 |
| `965d4b1` | **CI 진단성** — `storage upload: ON/OFF` 로그 한 줄 (시크릿 미전달 시 초록불로 조용히 로컬 전용 실행되던 문제 가시화). checkout@v5·setup-python@v6 (Node 경고 제거) |
| `df1d313` | **Storage 400 근본 해결** — `save()` 헤더에 `apikey` 추가. 새 `sb_secret_` 형식 키는 JWT가 아니라 `Authorization: Bearer`만으로는 400. 실제 API 대조로 재현 확인 |

## Next.js 전환 (`567b195`, 50파일 +2107/−1562)

이후 Supabase 로그인·서버 동기화(Phase 2~3)를 얹기 위한 프레임워크 이전.

- 라우트 8개를 `app/*/page.tsx` 2줄 래퍼로: `'use client'` + `export { default } from '../src/screens/X'`
- `src/pages/` → `src/screens/` rename (호출부 무변경)
- `src/lib/nav.tsx` 신규: react-router `useNavigate`/`<Navigate>` 시그니처를 흉내낸 얇은 래퍼 — 화면 코드 무수정 목적
- `app/shell.tsx` 신규: 탭바 + zustand persist 하이드레이션 `mounted` 게이트(SSR 미스매치 회피) + 구 HashRouter URL(`/#/sim`) 리다이렉트(`ponytail:` 주석, 추후 삭제) + 테마 오버라이드
- 데이터 base URL 환경변수화 — `src/lib/data.ts:81` `process.env.NEXT_PUBLIC_DATA_URL ?? '/data'`. 모든 로더가 이 base 사용
- `candle-counts.json` 빌드타임 import → 런타임 `loadMaxBars()`
- 삭제: `index.html`, `App.tsx`, `main.tsx`, `vite.config.ts`. deps: vite·react-router 제거, `next ^16.3.0` 추가
- 부가: `submitReview`가 `Trade[]`를 `SimRecord.trades`에 보존(**R0-1**), 시뮬 resume 실패 시 무한로딩 → 연습 탭 복귀

## 데이터 파이프라인 이관 (`377f7e7`)

`charty-web/scripts/fetch-data.py` 단일 스크립트, 출력을 Supabase Storage `data` 버킷(public)에 업로드.

- `save(name, text)`: 로컬 `public/data/` 기록 + `SUPABASE_URL` 있으면 Storage PUT(3회 재시도, 5/10s 백오프). 키 없으면 로컬 전용 — 기존 동작 보존
- 반쪽 시크릿(`SUPABASE_URL`만) 시 즉시 `SystemExit` fail-fast
- 빈 yfinance DF 가드 — 스로틀 시 좋은 데이터를 빈 것으로 덮어쓰기 방지
- GDELT: 2017-01-02 월요일 그리드 정렬로 **완결된 주만** 수집. CI는 매번 새 체크아웃이므로 Storage public URL에서 기존 아카이브 GET으로 **증분 이어받기**. 이어받기 GET이 400/404 외 실패면 `SystemExit`(부분본이 완본 덮어쓰기 방지)
- Polygon·ALFRED 경로 제거(08-05 감사에서 미사용 판정), CNN FNG 차단 시 빈 배열 폴백, Windows cp949 크래시 방지

### CI: `.github/workflows/daily.yml`

- 트리거: cron `0 2 * * *` (KST 11:00, 미장 마감 후) + `workflow_dispatch`
- 스텝: checkout@v5 → setup-python@v6(3.12) → `pip install yfinance pandas requests` → `python charty-web/scripts/fetch-data.py`
- 시크릿: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. timeout 300분(GDELT 최초 백필 여유)
- 빌드·배포 스텝 없음 — 프런트 배포는 Vercel Git 연동에 위임

## 인프라 현황 (08-06 실측)

| 항목 | 상태 |
|---|---|
| Actions run #1 (`377f7e7`) | success — 시크릿 미전달로 로컬 전용 실행 추정 (조용한 가짜 초록불) |
| Actions run #2 (`965d4b1`) | **failure** — 로그 추가로 400이 표면화 |
| Actions run #3 (`df1d313`) | **success** (08-05 16:26~16:32 UTC, 6분) — apikey fix 검증 완료 |
| Storage 버킷 `data` | 캔들·tickers·candle-counts·econ(287KB)·news 적재 확인(HTTP 200, run #3 시각 일치) |
| `news-archive.json` | **1KB뿐** — GDELT 백필 초반 차단, 진행분만 저장. 매일 cron이 이어받아 점진 완성되는 설계 |
| Vercel | `vercel.json` 없음 — 루트 디렉터리(`charty-web`)·env `NEXT_PUBLIC_DATA_URL`은 **대시보드에만** 존재 |
| 환경변수 | GitHub: `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` · Vercel/로컬: `NEXT_PUBLIC_DATA_URL` · Phase 3용 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`는 선언만(코드 참조 0건) |

## 검증

- CI run #3 success + 버킷 파일별 HEAD로 크기·갱신시각 대조 (GitHub API·Storage public URL, 인증 불필요)
- 버킷 `data`는 public 전제 — 프런트 익명 fetch와 GDELT 이어받기 GET 양쪽이 의존

## 후속 권장 → 08-06 당일 처리 완료

같은 날 후속 세션에서 5건 모두 처리 (커밋 d0453f3·7adbeb4·c9c42fb):

1. ~~`public/data/` git 추적 해제~~ — `git rm -r --cached` 완료(28개 파일, 로컬 유지). 처리 중 **Vercel `NEXT_PUBLIC_DATA_URL`이 Development 환경에만 설정된 것을 발견** → All Environments로 수정 (안 했으면 push 시 프로덕션이 빈 데이터로 깨졌음)
2. ~~`news-archive.json` 백필~~ — 코드 보강: 429 재시도 3→6회(백오프 60~960s), **10분 시간 기반 체크포인트**(주기 기반은 스로틀 시 도달 불가 — Plan 리뷰 지적), seendate 누락 가드. 로컬 IP는 여전히 429라 CI 경로만 유효, 수동 dispatch로 가속. 월 단위 쿼리 전환은 품질 리스크로 보류
3. ~~README 현행화~~ — Next.js 기준 재작성
4. ~~`.env.example`~~ — 추가 (placeholder만, 값 미기재)
5. ~~버전 고정~~ — pip `yfinance==1.5.2 pandas==3.0.5 requests==2.34.2`(08-05 성공 run 검증 조합), `tsconfig strict: true`(`tsc --strict` 에러 0 확인 후 전환)

검증: py_compile·`tsc --noEmit`·vitest 10개·`next build` 전부 통과 후 push.
