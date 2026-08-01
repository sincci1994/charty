# 차티 (Charty Web)

과거 캔들을 하나씩 넘기며([다음 캔들]) 매매 습관을 훈련하는 모의투자 웹앱.
서버 없음 — 모든 기록은 브라우저 localStorage에 저장됩니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173 에서 확인 (개발자도구 모바일 뷰 추천)
```

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm test` | 체결/청산 엔진 테스트 |
| `npm run build` | 배포용 빌드 (`dist/` → GitHub Pages/Vercel에 그대로 올리면 됨) |
| `python scripts/fetch-data.py` | 캔들 데이터 갱신 (yfinance, 가끔 한 번만) |

## 구조

- `src/lib/engine.ts` — 주문 체결·평단·손익 계산 (앱의 심장, 테스트 있음)
- `src/store.ts` — 전역 상태 + localStorage 저장
- `src/pages/Simulation.tsx` — 핵심 화면 (차트 + 다음 캔들 + 주문)
- `public/data/` — 티커별 캔들 JSON (정적 번들)

## 규칙 요약

- 스타일: 단타(1일·5분봉) / 스윙(14일·1시간봉) / 장기(60일·4시간봉)
- 지정가 주문만. 다음 캔들의 저가~고가에 지정가가 들어오면 체결
- 롱/숏 각 1포지션, 추가 진입 시 평균단가 재계산 (숏은 진입금액만큼 증거금 잠금)
- 종료(마지막 캔들 또는 [지금 종료]) 시 잔여 포지션 종가 청산 → 회고 작성
