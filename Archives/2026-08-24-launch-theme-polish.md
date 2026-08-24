# 2026-08-24 — Launch 화면·테마 3종·스플래시 정리 + 아키텍처 문서화 + 성능 진단

## 작업 개요

앱 완성도 스프린트: **① Launch 화면 이식**(claude.ai/design `Launch.dc.html` — 스플래시 드로잉 애니메이션 + 시작 화면),
**② 아이콘 2차 재제작**(누끼 로고 `icon_empty.png` 기반, 여백 확보), **③ 테마 3종 체계**(라이트/다크/차티),
**④ 2중·3중 스플래시 제거**(네이티브 정적 + OS 시스템 스플래시 무력화), **⑤ 아키텍처 문서 5종**,
**⑥ 홈 닉네임 팝인 진단·수정**(프로필 SWR 미러). 부수로 bubblewrap 빌드 재실패의 근본 원인(32비트 JDK) 제거.

## 커밋 내역

| 해시 | 내용 |
|---|---|
| `f5d72a7` | Launch 화면 이식 — Welcome 전면 교체(스플래시 3.8s→시작, Google만·카카오 숨김), `Splash.tsx` 공유 컴포넌트, 설치형 앱 콜드 스타트 브랜드 스플래시(세션당 1회, 웰컴 게이트와 중복 방지), 아이콘 재생성(로고 60%/54% + Launch 그라데이션 배경), 다크 토큰을 남색 radial 그라데이션으로 |
| `6493c60` | bubblewrap update v3 (여백 아이콘·그라데이션 색 반영) |
| `d44231f` | **테마 3종 확정** — 남색 그라데이션 룩을 `charty` 테마로 분리, 다크는 기존 #1E1E1E 복원(사용자 번복), More 토글→3칩. charty 블록은 시스템 다크 셀렉터와 동일 특이도라 뒤에 배치(순서로 승리) |
| `1f06807` | 2중 스플래시 1차 — 네이티브 `splash.png` 5종을 1×1 투명으로 (update가 되돌리므로 git checkout 복원 규칙 문서화) |
| `2439b59` | **아키텍처 문서 5종** `docs/architecture/` — web(부채 대장 상위 5)·android(단일 소스 규칙)·app(폐기 사료)·comparison(웹 전환 회고)·proposal(구조 판정 "양호"·부채 규약 6조) |
| `33f5a08` | **홈 닉네임 팝인 수정** — 프로필 로컬 미러(`charty:profile`, uid 검증) SWR: 캐시 먼저 그리고 서버로 조용히 갱신. SIGNED_OUT·계정 전환 시 무효화. + **IRBT 제거(8/22) 이후 이틀간 깨진 채 방치된 SETS 테스트 발견·수정** |
| `21a754e` | 2중 스플래시 2차 — "확대된 로고"의 정체는 **Android 12+ 시스템 스플래시**(런처 아이콘 확대·크롭). LauncherActivity 전용 테마(values/values-v31)로 아이콘 투명+배경 남색 오버라이드 |

## 진단 기록

- **닉네임 팝인 원인**: 프로필만 유일하게 Local-first 밖 — 세션 복원(비동기, 첫 렌더 null) + 매 진입 Supabase 왕복(50~300ms).
  잔고·기록은 localStorage라 즉시 → 대비가 팝인으로 보임. 해법 = SWR 미러(스토어 필드 추가 없이 profile.ts 내부 해결).
  호출부 함정: 기존 effect가 세션 미복원(null) 구간에 setProfile(null)로 캐시를 지움 → "미복원이면 미러 유지, 로그아웃은
  shell의 SIGNED_OUT에서 미러 삭제"로 구분.
- **스플래시 3겹 구조**: OS 시스템 스플래시(12+, 제거 불가·아이콘만 투명화 가능) → 네이티브 TWA 스플래시(splash.png)
  → 웹 브랜드 애니메이션. 최종 상태: 남색→남색→로고 드로잉 (로고는 그려지는 것 한 번만).
- **bubblewrap 함정 2개 확정**: `update`가 gradle.properties 등 템플릿 파일을 되돌림 + 동봉 JDK가 32비트(힙 1.5G 확보 실패 재발).
  근본 해결 = 64비트 Temurin 17을 `~/.bubblewrap/jdk-x64/`에 격리 설치, config.json jdkPath 교체(레포 밖이라 update 무영향).

## 검증

- vitest 63/63(수정 후), tsc, 웹/export 빌드, gradlew assembleRelease 그린
- 하니스: Launch 스플래시→시작 전환·바로 시작→홈, 테마 3종 각각 bg 실측(#F5F5F7/#1E1E1E/#0A0F26+그라데이션),
  닉네임 미러 시드 후 **첫 렌더에 "안녕하세요, 테스트닉님!"** 확인
- 실기기(사용자): 새 아이콘·스플래시 흐름·테마 전환 확인 (시스템 스플래시 무력화는 재빌드 후 확인 예정)

## 남은 것

- **A4 대기**: Play 신원 인증 완료 → AAB 업로드 + Play 앱 서명 키 지문을 assetlinks 2번 슬롯에(필수) → 등록정보(문구·그래픽 Claude 초안) → 테스터 12명×14일
- **CI 워크플로 제안 중**: push마다 tsc+vitest (부채 #1 — 이번 SETS 테스트 방치가 실증 사례). 사용자 승인 대기
- 트랙 B(iOS): Mac 확보 방식 결정 대기
- charty.app 도메인: 9월 말~10월 초 드롭 여부 확인
- bubblewrap update 후 체크리스트(문서화됨): splash.png 5종 + AndroidManifest theme 1줄 git checkout 복원
