# 2026-08-13 — R13 자산 동기화 + 누적 차트시간 + 테마주 6종 + 재무 견고화

## 작업 개요

테스트 중 발견된 4가지 문제를 한 번에: **① 웹↔앱 자산 미동기화**(1차 원인 = Android 설치 앱에서 미로그인, 구조적 원인 = 잔고·진행 세션·커스텀이 서버에 아예 없음), **② "재산 모으는 데 걸린 시간" 지표 부재**, **③ 유니버스가 빅테크 6종이라 단조 우상향**, **④ 재무 탭 조회 실패 잦음**(실체 = ETF 33% + fetch 실패를 빈 데이터로 삼킴 — 레이트리밋 아님). 부수로 Vercel 배포 장애(Supabase 통합 스토어 정지) 진단·해결.

## 커밋 내역

| 해시 | 내용 |
|---|---|
| `9dd65c0` | **R13 본체** — (1) `public.state`(유저당 1행 jsonb + 클라이언트 `updated_at` LWW)로 balance·activeSim·customs·welcomed·waitlistAt 동기화. push = zustand 구독 1개 + 트레일링 2초 디바운스(`sync.ts initStateSync`), pull = 로그인 핸들러(shell). `applyServer` 플래그로 서버 반영 set을 변이로 오인하는 LWW 오염 차단. 계정 전환 시 스토어 리셋+와이프(중복 핸들러 경합 가드 `wiping`). (2) `SimRecord`에 `elapsedBars`/`early`/`startTs`/`endTs` 옵셔널 캡처(마이그레이션 불필요), History 캡션에 달력 기준 `fmtDur` 표시, 조기 종료는 플레이한 구간까지만. (3) 티커 6종 추가(PLUG·FCEL·LCID·RIVN·JOBY·IONQ — 스토리·테마 카테고리, 사용자 선택), `candle-counts.json` 종목별 전환(+구형식 스니핑 폴백), `startSim` 적합 필터(기간 감당 종목만), LEAK_NAMES 확장 + 심볼 필터 단어 경계화. (4) fund 탭 3상태(`null\|'error'\|data`, 재시도 버튼), FUND_TICKERS 10종(신생 4종 MIN_ROWS 12), 파이프라인 종목별 격리 + fundamentals 이전본 머지 + 실패 시 맨 끝 exit 1 |
| `6203a5c` | Vercel 재배포 트리거(빈 커밋) — 결과적으로 인프라 문제라 무효, 아래 포스트모템 참조 |

## 멀티에이전트 리뷰 (커밋 전 수정 완료)

3개 렌즈(동기화·파이프라인·클라이언트) → 발견별 적대 검증, 13에이전트. **10건 확인·전부 수정**:

- **(critical) applySync의 잔고 쓰기를 push 구독자가 사용자 변이로 오인** → 신규 기기가 서버 state를 영영 못 받고 2초 뒤 빈 상태로 서버 클로버. 픽스 = `applyServer` 플래그(구독자는 기준 스냅샷만 갱신)
- (major) 시드-0 구멍: 파생값(잔고)뿐인 빈 로컬은 시드 생략, 기기 고유 상태 있을 때만 `stateUpdatedAt \|\| Date.now()`로 시드
- (major) applyState가 candles 미정리 → sim 교체 시 이전 종목 캔들 인덱싱 크래시. 픽스 = sim id 바뀌면 `candles: []`
- (major) fundamentals 이전본 GET이 5xx를 '파일 없음'으로 삼켜 축소본이 완전본 덮어씀 → 400/404 외엔 raise(RuntimeError — SystemExit는 바깥 `except Exception`에 안 잡힘)
- (minor) 로그인 시 로컬이 더 새로워도 재푸시 없음 → `pulled.updatedAt < local`이면 push 분기 추가
- (minor) 계정 전환 와이프 경합(INITIAL_SESSION·SIGNED_IN 이중 큐잉) → `wiping` 플래그 + 스토어 선리셋
- (minor) AAPL 카나리아 KeyError(이중 실패 시) → `if "AAPL" in fund` 가드
- (minor) PLUG 세션에서 'plugs' 포함 무관 헤드라인 과필터(실데이터로 재현 확인) → 심볼 매칭 단어 경계 정규식

## 검증

- vitest 42개(신규: `cumulativeSimTime`·`fmtDur`·`normalizeCounts`) + tsc + `next build` + `py_compile` 그린
- 신규 6종 yfinance 원오프: 전부 상장 유지, PLUG/FCEL 5030개(20y), 신생 4종 1192~1481개 일봉
- 브라우저 QA(실계정 데이터, localStorage 백업 `charty:bak-20260813` 후): 홈·기록·더보기·연습·시뮬 레이아웃 정상, More "동기화 실패" 문구 동작(당시 state 테이블 미생성 상태의 올바른 노출), 시뮬 심볼 마스킹·재무 패널 정상, QA 세션은 폐기로 원상복구. /sim CDP 스크린샷 먹통은 기지 증상 — javascript_tool로 검증
- **다음날(08-14) 확인**: daily 런 success — `tickers.json` 12종, `candle-counts.json` 종목별 형식, `fundamentals.json` 10종(PLUG 64·FCEL 63·신생 4종 23분기, MIN_ROWS 12 통과). `state`·`records` REST 200

## 배포 장애 포스트모템 — "Resource provisioning failed"

- **증상**: R13 푸시 후 배포 연속 실패, 빌드 로그 0줄(빌드 시작 전 실패). 로컬 빌드는 통과, Vercel 플랫폼 정상, 프로젝트 설정 무변화.
- **원인**: 8/5 설치한 Vercel Supabase 통합의 스토어 `supabase-cyan-pillow`가 미사용 `krfdsex…` 프로젝트에 연결 → Supabase가 방치 프로젝트를 자동 정지(DNS까지 소멸) → 스토어 `status=suspended` → 프로젝트 연결의 `deployments.required: true`가 **모든 빌드에 죽은 리소스 프로비저닝을 요구**. 8/10까지 성공한 건 그때는 살아 있었기 때문.
- **해결**: 스토어-프로젝트 연결(`spc_kvrIJ94…`) API DELETE → 즉시 배포 성공(38s), `charty-ruddy.vercel.app` 프로모트.
- **교훈**: 로그 없는 배포 실패 = 코드가 아니라 프로비저닝 전제조건(통합·스토어)부터 의심. 미사용 통합은 "나중에 정리"가 아니라 시한폭탄이었다.

## 남은 것

- **통합 잔재 제거**: 통합 설정 `icfg_28I1…`은 API DELETE가 500(죽은 프로바이더 콜백 추정). Vercel 대시보드 → Settings → Integrations에서 수동 제거 시도 — 연결은 이미 끊겨 무해하므로 실패해도 방치 가능. 제거 성공 시 08-10 아카이브의 "환경변수 정리 절차" 3~5단계 이어서 진행 가능
- **Android 실기기 재검증**: 설치 앱에서 로그인 → 웹 자산 복원(원 신고 시나리오). 진행 세션·커스텀은 웹에서 변이 1회 후 서버에 올라가기 시작
- GitHub 커밋 상태의 `6203a5c` failure 표시는 인프라 수정 전 기록 — 다음 푸시부터 정상
- R13 알려진 한계(코드 주석 명시): LWW라 두 기기 동시 진행 세션은 최신이 승리(머지 없음), '기간말~공시 사이 역분할' 낀 분기의 EPS 근사(FCEL '19.05 등, 분할당 최대 1분기)
