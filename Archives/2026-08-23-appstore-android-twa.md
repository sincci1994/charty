# 2026-08-23 — 앱 스토어 배포 착수: Phase 0 + Android TWA 패키징 (트랙 A)

## 작업 개요

charty-web을 스토어 앱으로 배포하는 로드맵 수립·착수. 확정 사실: 현재 안드로이드 사용자의 "설치 앱"은
charty-ruddy.vercel.app의 **PWA 설치본**이고, `charty-app/`(RN)은 1년 전 폐기된 별개 레포라 출발점 아님.
전체 로드맵은 `~/.claude/plans/githubaction-failed-hidden-curry.md`.

**주요 결정** (사용자):
- **도메인 구매 보류** — charty.app은 타인 선점 후 '26-07-26 만료 상태(파킹 중, 미갱신 시 9월 말~10월 초
  드롭 예상 — 그때 백오더 ~$60-80 검토 가치). Vercel 주소로 앱 배포 가능해 보류. charty.kr·co.kr은 미등록(8/23 기준).
- **Android=TWA(Bubblewrap) + iOS=Capacitor 로컬 번들, 동시 진행.** packageId `io.github.sincci1994.charty`(영구).
- **화면 방향 portrait 고정** (회전 허용으로 갔다가 번복) — 가로 차트는 [백로그] '차트 확대' 버튼 → CSS 90도
  회전 전체화면(iOS엔 orientation.lock API가 없어 OS 회전 방식은 크로스플랫폼 불가).
- 앱 아이콘 = 사용자 제작 원본 레포 루트 `icon.png`(1254px, **git 미추적 — 지우지 말 것**).
- 인앱결제는 지금 안 켬(Play Billing N) — 나중에 twa-manifest 수정+재빌드로 추가 가능. 구독 도입 시
  Play 결제 수수료 15%~ vs 웹 결제 정책(앱 내 외부결제 유도 금지) 설계 필요.

## 커밋 내역

| 해시 | 내용 |
|---|---|
| `84c77b6` | Phase 0 — manifest 보강(id/scope/lang 등), 수제 `public/sw.js`(정적 cache-first·HTML/데이터 network-first), `/privacy`, 커스텀 스타일 라우트 `[[...id]]`→`?id=`(정적 export 요건), next.config CAPACITOR=1 export 분기 |
| `a726ce4` | `npm run build:cap` — iOS용 정적 export 빌드 스크립트(out/에서 data 21MB·.well-known 제거) |
| `8740e20` | QA 버그 2건 — sw.js `?? \|\|` 무괄호 SyntaxError(SW 등록 조용히 실패), trailingSlash로 /welcome·/sim 탭바 노출(pathname 끝슬래시 정규화) |
| `a160b79` | 새 앱 아이콘 적용(512/192/180 리사이즈) + orientation 제거(→직후 번복) |
| `7469c5a` | manifest portrait 복원 |
| `2c9026a` | charty-android/ — Bubblewrap TWA 프로젝트(서명 키는 gitignore) |
| `16b29c7` | gradle 힙 1GB — bubblewrap 동봉 JDK가 32비트라 1.5GB 확보 실패 |
| `bba73c6` | `.well-known/assetlinks.json` — 업로드 키 SHA-256 등록·배포 |
| (이후) | favicon.svg → favicon.png(새 아이콘 64px) 교체 + 본 아카이브 |

## QA (폰 뷰포트 iframe 하니스, 정적 번들 = iOS 미리보기)

- 전 흐름 검증: 웰컴 → 연습 → 스타일 2단계 → **시뮬 차트 렌더**(캔들·EMA·거래량·주문바) → 더보기·privacy.
  캔들·econ·news CDN 200 (외부 출처 CORS 통과 — capacitor:// 근거).
- 프로덕션 SW: 등록 실패 원인(SyntaxError) 수정 후 **active + charty-v1 캐시 생성 확인**.
- 교훈(브라우저 QA 메모리에도 기록): SW는 3중으로 조용히 죽는다 — `node --check` → getRegistration() →
  caches.keys() 3단 검증 필수. 로컬 python 서버는 캐시 헤더가 없어 구버전 HTML을 서빙 — `?v=` 캐시버스터로 검증.

## TWA 패키징 (A1~A2 완료)

- bubblewrap init은 대화형 CLI라 `!` 프리픽스 불가 — **별도 터미널**에서 사용자가 실행. JDK·SDK는 `~/.bubblewrap` 격리 설치.
- 빌드 이슈 2건: ① 동봉 JDK가 **32비트**(Client VM) → 기본 힙 1.5GB 확보 실패 → 1GB로 조정,
  ② SDK 라이선스 미동의(build-tools 35, platform 36) → `~/.bubblewrap/android_sdk/licenses/` 동의 해시 파일(CI 표준 방식).
- APK·AAB 서명 빌드 성공. 지문은 **`keytool -printcert -jarfile app.apk`로 비밀번호 없이 추출** →
  assetlinks.json 배포·라이브 확인(200, application/json).
- 서명 키: `charty-android/android.keystore`(gitignore) + 비밀번호 2개는 사용자만 보관. **분실 = 앱 업데이트 영구 불가.**

## 남은 것

- **A3**: 폰에 `app-release-signed.apk` 설치 — URL바 없음·새 아이콘·기존 PWA 데이터 이어짐·세로 고정 확인 (진행 중)
- **A4** (Play 신원 인증 완료 후): 앱 생성 → AAB 비공개 테스트 업로드 → App integrity의 **Play 앱 서명 키 SHA-256을
  assetlinks 2번 지문으로 추가** (안 하면 스토어 설치본에 URL바) → 등록정보(피처 그래픽 1024×500·문구·데이터 안전
  설문은 Claude 초안, 스크린샷은 실기기) → 테스터 15명 모집, 12명+ 14일 옵트인 → 프로덕션 신청
- **트랙 B(iOS)**: Mac 확보 방식 결정 → Capacitor 셸 + OAuth 딥링크 분기(계획 수립 완료, 정적 export는 검증 완료)
- [백로그] 차트 확대 → 가로 전체화면(CSS 회전) — TWA는 웹 배포=앱 업데이트라 출시 후 추가해도 재심사 불필요
