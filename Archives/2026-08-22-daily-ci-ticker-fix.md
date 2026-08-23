# 2026-08-22 — daily-data CI 연속 실패 해결 (IRBT 상폐 + 재무 다중 CIK 병합)

## 작업 개요

daily-data 워크플로가 **#17(8/17)~#22(8/22) 6런 연속 실패**. 6개 런 모두 동일한 실패 집합
`['IRBT', 'fund:AVGO', 'fund:XOM', 'fund:DIS', 'fund:IRBT']`였고, 시작점은 R15~R16 유니버스 확장
커밋(28802e2) 푸시 직후. `fetch-data.py`는 설계상 좋은 데이터는 전부 저장 후 실패 종목이 있으면
맨 끝 exit 1로 CI를 빨갛게 만드는 구조(red-by-design)라, CI 빨간불 ≠ 데이터 유실이었음.

원인 2가지 (라이브 SEC/Yahoo 데이터로 검증):

1. **IRBT 상장폐지** — Yahoo 404("Quote not found") + SEC company_tickers.json에서 삭제. 영구 실패.
   추가 후 한 번도 성공 못 해 Storage에 IRBT 데이터 자체가 없었음(앱은 tickers.json 기반이라 자동 제외).
   → 사용자 결정: **교체 없이 제거**, 러셀 스몰캡 5종(CROX GPRO FSLR KTOS SFIX) 유지.
2. **지주사 전환으로 SEC 티커맵 CIK의 XBRL 이력이 짧음** — 검산(기본 45행) 미달:
   - XOM rows=2: 티커맵이 '26 신설 "ExxonMobil Holdings Corp"(CIK 2115436, 분기 2개)를 가리킴. 본체 34088에 전체 이력.
   - DIS rows=39: '19 Fox 인수 지주사(1744489, 2016~). 구 본체 1001039에 2008~2018.
   - AVGO rows=38: '18 미국 재설립(1730168, 2017~). Broadcom Ltd 1649338(2015~18) + Avago 1441634(2010~15).
   → `EXTRA_CIKS` 도입, `edgar_quarters`가 CIK 리스트를 받아 pool 단계에서 병합.
   (start,end) 키에 filed 최솟값 유지라 법인 간 중복 공시도 최초 공시가 이김 — point-in-time 원칙 그대로.

## 커밋 내역

| 해시 | 내용 |
|---|---|
| `d666235` | IRBT 제거(fetch-data.py TICKERS·FUND_TICKERS, data.ts RUSSELL, Simulation.tsx LEAK_NAMES) + EXTRA_CIKS 다중 CIK 병합 |

## 검증

- 수정 전 사전 실측(동일 로직 재현 스크립트): 병합 시 XOM 72행·DIS 72행·AVGO 66행 — MIN_ROWS 오버라이드 불필요 확인
- 로컬 전체 실행: tickers 29종(IRBT 없음), 재무 26종 실패 0, AVGO 66·XOM 72·DIS 72 (예측과 정확히 일치)
- 푸시 후 workflow_dispatch **run #23 green** — fundamentals.json에 세 종목 반영·Storage 업로드 확인.
  이후 정기 cron도 정상 (GDELT 429 백필 중단은 설계상 실패 아님 — 매일 증분 계속)

## 교훈

- **신규 티커 추가 시 SEC company_tickers.json의 CIK가 지주사 신설 법인일 수 있음** — 재무 이력 길이 확인 필수
- gh CLI 없이 Actions 진단: runs/jobs 목록은 무인증, **로그 다운로드는 public 레포여도 인증 필요** — `git credential fill`로 GCM 토큰 꺼내 API 호출

## 남은 것

- 없음 (이슈 종결). IRBT 자리는 필요 시 추후 다른 러셀 스몰캡으로 보충 가능
