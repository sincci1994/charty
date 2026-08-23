# charty-app 아키텍처 (폐기 — 참조용)

> 작성 2026-08-24. 대상: `charty-app/` — **메인 레포의 일부가 아니다.** 자체 .git을 가진 별도 레포
> (github.com/ydh4481/charty-app)의 로컬 클론이며 루트 .gitignore로 제외됨. 마지막 커밋 2025-08-17, 이후 폐기.
> **낡는 조건**: 없음 (동결된 사료). 디렉토리를 지우면 이 문서가 유일한 기록이 된다.

## 한 문장 요약

React Native(bare 0.79) + FastAPI + Postgres의 **완전 서버 의존** 설계 — 시뮬레이션 상태까지 서버 DB가
소유했다. 인증 플로우만 완성된 채 멈췄고, **차트·시뮬 화면은 한 줄도 작성되지 않았다.**

## 당시 설계

### front/ — 레이어 우선 + features 하이브리드
- 완성: 인증 3화면(Login·CreateProfile×2), shared UI 8종, axios 클라이언트 + tokenManager, 디자인 토큰
- 미완: home/practice/history feature 디렉토리 자체가 없음 — 내비게이션 Stack 안 인라인 플레이스홀더("홈 화면" 텍스트)뿐
- 특이: zustand는 의존성에만 있고 실사용 0 (appState는 useState 커스텀 훅). 내비게이션 2중 구조
  (인증 플로우는 문자열 스위치 수동 렌더, 인증 후에만 React Navigation). 차트는 WebView+lightweight-charts 계획(미구현)
- **앱 부팅이 서버 헬스체크에 블로킹** — 서버 없으면 화면이 안 뜸. 프로덕션 API URL은 존재하지 않는 도메인 하드코딩

### back/ — 도메인별 수직 슬라이스 (모델/라우터/스키마/서비스 4~5층 + DI)
- 라우터 8개: auth(OAuth+JWT refresh) · tickers/candles(캔들 CRUD + **랜덤 구간 추출 SQL**) · trading/styles ·
  simulations(세션+주문) · macros · app/bootstrap
- **시뮬 상태가 DB 테이블**: Simulation 테이블이 current_candle_index·current_assets·order_count까지 보유 —
  캔들 한 칸 진행마다 서버 왕복이 필요한 구조
- 데이터: yfinance 직접 호출 없음 — 로컬에서 한 번 긁어 **SQL 덤프(177KB)로 seed**. alembic은 껍데기(리비전 0건)

## 왜 폐기됐는가 (구조적 판정)

혼자 만드는 교육용 시뮬레이터에 **운영 비용이 전부 서버로 쏠린 설계**였다: DB 호스팅·마이그레이션·JWT 수명주기·
배포 파이프라인을 갖춰야 화면 하나를 그릴 수 있었고, 실제로 인프라 층위만 다 만든 시점에 제품 층위(차트·시뮬)가
0줄이었다. charty-web은 같은 제품을 "서버 상태 소유 → 클라이언트 상태 소유"로 뒤집어 이 비용을 제거했다
(서버는 인증 + 덤 저장소 + 데이터 CDN만).

## 계승 vs 사장

| 개념 | charty-app | charty-web | 판정 |
|---|---|---|---|
| 4탭 IA (홈/연습/기록/더보기) | Stack 4개 | app/ 라우트 그대로 | **계승** |
| 매매 스타일 프리셋 | trading_style 테이블 | data.ts STYLES 상수 | 계승 (DB→상수 강등) |
| 시뮬 세션 | 서버 소유 DB 행 | ActiveSim 클라이언트 store | 계승 + **소유권 역전** |
| 체결 엔진 | 서버 서비스(Decimal·트랜잭션) | engine.ts 순수 함수 | 재작성 — 웹판이 수수료·환율·거래량 참여율까지 더 앞섬 |
| 캔들 + EMA 13/25/200 | DB 컬럼 | CDN JSON + 클라이언트 계산 | 개념 계승 |
| 인증 | 자체 OAuth+JWT | Supabase Auth | 사장 |
| FastAPI·Postgres·RN 코드 전부 | — | — | **100% 사장** |

혹시 쓸 게 남았나: 스타일 프리셋 파라미터·EMA 세트·4탭 IA는 이미 웹에 이식 완료. 캔들 SQL 덤프는
fetch-data.py가 상위 호환. **이 디렉토리에서 더 가져올 것은 없다** — 보존 사유는 기록 가치뿐이므로,
디스크가 아까우면 이 문서를 남기고 지워도 된다.
