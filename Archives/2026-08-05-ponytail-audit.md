# 2026-08-05 — 저장소 전체 오버엔지니어링 정리 (ponytail-audit)

## 작업 개요

`/ponytail-audit`로 저장소 전체를 스캔해 죽은 코드·중복·안 쓰는 유연성을 찾아 제거.
**순감소: 51개 파일, +209/−1,400줄, 추적 데이터 −2.8MB, 의존성 −1개(@types/node), 파일 −25개.**

## 삭제한 것

| 항목 | 내용 |
|---|---|
| 로고 웹페이지 | `Charty 앱 로고 디자인.html` + `_files/` (1.6MB, 참조 없음) |
| 파생 캔들 JSON 18개 | `*_15m/30m/4h.json` (1.2MB) — 앱이 5m/1h를 로드해 `resampleCandles`로 생성. 삭제 전 기존 파일과 **바이트 단위 동일** 검증 완료 |
| 미사용 에셋 | `src/assets/hero.png`, `src/assets/vite.svg`, `public/icons.svg` |
| fetch-data.py 96줄 | 한 번도 실행된 적 없는 Polygon·ALFRED API 키 경로, `points()` 축소, `rss(n)` 파라미터 |
| 매매 이유 기록 배관 | `Order.reasons`→`Trade.reasons` — 수집·저장만 하고 어디에도 표시 안 됨. OrderSheet 칩 UI, store 파라미터, engine 전달, 관련 테스트 모두 제거. Practice 카드 문구도 수정 |
| FOMC 점도표 자리표시 | NewsPanel의 "데이터 연동 예정" 하드코딩 SVG |
| 죽은 CSS | `.big-number` `.primary-btn` `.ghost-btn` `.danger-btn` `.sim-tab.off` |
| 설정 한 줄들 | manifest `scope`, index.html preconnect, `.oxlintrc.json` `$schema`, `preview` 스크립트, AssetChart DEV assert, `EconIndicator.label/unit` |
| tsconfig 3분할 | `tsconfig.app.json`/`tsconfig.node.json` → 단일 `tsconfig.json`, 빌드 `tsc -b` → `tsc`, `@types/node` 제거 |

## 통합한 것 (중복 제거)

- **`TF` 테이블 하나**로 타임프레임 3개 테이블(`TF_LABELS`+`TF_SEC`+Simulation/CustomStyle의 `TF_CHIPS`) 및 `STYLES.interval` 통합 — `src/lib/data.ts`
- **`Pins` 컴포넌트 공유** — 홈 시장현황(국내/해외)과 NewsPanel 요약 타일이 같은 마크업 사용 — `NewsPanel.tsx`
- **`polyline` 헬퍼 공유** — AssetChart `toLinePath`와 NewsPanel `line()` 통합 — `AssetChart.tsx`
- **`styleLabel`·`START_BALANCE`** data.ts에서 1회 export, 4개 파일에서 재사용 (각자 재선언하던 것)
- `currentEquity` 위임 래퍼 인라인, 진행률 가드는 `simProgress` 안으로 이동
- OrderSheet/IndicatorSheet: 열릴 때만 마운트 — `open` prop·showModal 동기화 effect·리셋 setState 6개 제거 (fresh mount = 무료 리셋)

## 감사에서 틀린 걸로 판명나 건너뛴 것

- **Chart `dataRef` 시딩** — 지표 토글 시 차트가 재생성되는데 데이터 effect는 재실행 안 됨 → 시딩이 필수. 삭제하면 토글 시 빈 차트
- **다크 CSS 중복 블록** — 순수 CSS로는 `@media` 다크와 수동 다크를 합칠 수 없음. 합치면 시스템 테마 실시간 추적이 깨짐
- **`Trade.pnl`/`ts`** — engine.test.ts의 손익 검증(머니 패스)이 assert함 → 유지

## 알려진 트레이드오프

- `MAX_BARS['4h']` = `floor(1h개수/4)` 파생 — 실제(1704)보다 보수적(1268). 2년 이상 4h 커스텀 스타일 상한만 약간 좁아짐, 프리셋 무영향. 코드에 주석 있음

## 검증

- vitest 10개 통과, `tsc` 클린, `vite build` 성공
- 파생 JSON 삭제: QQQ 15m/30m/4h 리샘플 출력 vs 기존 파일 **IDENTICAL** (node 스크립트 비교)
- 화면 테스트: 홈 국내/해외 탭, 시뮬 타임프레임 칩(리샘플 경로), 주문/지표 시트 리셋, 테마 전환 — 사용자 확인 완료

## 후속 권장

- `python scripts/fetch-data.py` 1회 실행 — `econ.json` 재생성(미사용 label/unit 필드 제거) + `news-archive.json` 생성 (현재 시뮬 News 탭 헤드라인이 조용히 빈 배열 fallback)
- GDELT 블록은 유지함 — `news-archive.json`을 한 번 만들어 커밋해야 기능이 실제로 동작
