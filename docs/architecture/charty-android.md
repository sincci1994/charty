# charty-android 아키텍처 (Bubblewrap TWA)

> 작성 2026-08-24. **낡는 조건**: bubblewrap 버전 업, packageId/서명 체계 변경, 커스텀 도메인 전환 시 갱신.

## 한 문장 요약

charty-web을 Chrome 엔진 그대로 감싸는 **커스텀 코드 0줄짜리 생성물 셸** — 설정의 진실은
`twa-manifest.json` 하나이고, 나머지 파일은 전부 그것의 렌더 결과다.

## 3단 폭포 구조

```
charty-web/public/manifest.webmanifest   (원격 — PWA의 진실)
        │  bubblewrap init/update가 fetch
        ▼
charty-android/twa-manifest.json         ★ 로컬 단일 소스 (직접 편집하는 유일한 파일)
        │  bubblewrap update → 템플릿 렌더 + 아이콘 재다운로드
        ▼
app/build.gradle의 twaManifest 맵 → resValue → Android 리소스
```

- 도메인 소유 증명 고리: `twa-manifest.json`의 host → `strings.xml` assetStatements →
  서버측 `charty-web/public/.well-known/assetlinks.json`의 SHA-256 지문 매칭. **이 고리가 끊기면 앱에 URL 바가 뜬다.**
  지문은 2개 필요: 업로드 키(로컬 APK) + Play 앱 서명 키(스토어 배포본 — Console App integrity에서 복사).
- 버전 상향: `twa-manifest.json`의 appVersion/appVersionCode → update → build.gradle 전파. update가 자동 +1 하기도 함.
- **웹 콘텐츠 변경은 재빌드 불필요** — Vercel 배포가 곧 앱 업데이트. 재빌드가 필요한 경우는
  아이콘·이름·색·방향·packageId·권한 변경뿐.

## 파일 분류 — 무엇을 편집해도 되는가

| 분류 | 파일 | 규칙 |
|---|---|---|
| **편집 대상 (유지됨)** | `twa-manifest.json`, `.gitignore`, `store_icon.png` | 설정은 여기만 |
| **절대 커밋 금지** | `android.keystore` + 비밀번호 2개 | gitignore 됨. **분실 = 이 앱으로 업데이트 영구 불가** |
| **update가 덮어씀** | build.gradle·AndroidManifest·Java 3개·strings/colors.xml·**gradle.properties** 등 전부 | 직접 고치면 다음 update에서 증발 |
| **매 빌드 재생성** | `res/xml/shortcuts.xml` | git diff에 떠도 무시 |
| **update 시 재다운로드** | mipmap/drawable 아이콘·스플래시, raw/web_app_manifest.json | 원본은 웹의 icon-*.png — **웹에 먼저 배포 후 update** |

**예외 1건 — 투명 스플래시 (2026-08-24)**: `drawable-*/splash.png` 5개는 의도적으로 **1×1 투명 PNG로 교체해 커밋**돼 있다.
네이티브 정적 스플래시(로고 박힌 화면)와 웹 애니메이션 스플래시가 2중으로 보이는 문제의 해결 — 네이티브 단계는
남색 배경만 보이고 로고는 웹에서 그려지는 애니메이션으로만 등장한다. `bubblewrap update`가 이 파일들을
원본 아이콘으로 되돌리므로, **update 직후 반드시**:
```
git checkout -- charty-android/app/src/main/res/drawable-hdpi/splash.png charty-android/app/src/main/res/drawable-mdpi/splash.png charty-android/app/src/main/res/drawable-xhdpi/splash.png charty-android/app/src/main/res/drawable-xxhdpi/splash.png charty-android/app/src/main/res/drawable-xxxhdpi/splash.png
```
(git이 재적용 메커니즘 — update 후 diff에 splash.png가 뜨면 이 규칙을 잊은 것이다.)
**예외 2 — 시스템 스플래시 무력화 (2026-08-24)**: Android 12+가 런처 아이콘을 확대·크롭해 띄우는
시스템 스플래시도 남색만 보이게 오버라이드했다. 수작업 파일 `res/values/themes.xml` + `res/values-v31/themes.xml`
(bubblewrap 템플릿 아님 — update가 안 만짐) + **AndroidManifest.xml의 LauncherActivity에
`android:theme="@style/Theme.Charty.Launcher"` 1줄**(이건 update가 되돌림 — update 후 splash.png와 함께
`git checkout -- charty-android/app/src/main/AndroidManifest.xml`로 복원. 단, twa-manifest 설정을 바꿔서
manifest에 정당한 변경이 생긴 update라면 checkout 대신 theme 속성 1줄만 수동 재추가).
결과: 실행 순간부터 로고 없이 남색 → 웹 스플래시의 그려지는 애니메이션으로만 로고 등장.

실증 사례 (2026-08-24): gradle.properties의 힙 조정(1GB)이 update로 1536m 템플릿에 되돌아가 빌드가 재실패.
근본 해결은 프로젝트 밖 — **64비트 JDK를 `~/.bubblewrap/jdk-x64/`에 두고 `~/.bubblewrap/config.json`의
jdkPath 교체** (레포 밖이라 update 영향 없음). 이 원칙 일반화: *이 디렉토리 안에 지속 수정을 넣지 말 것.*

## 빌드 절차 (재현용)

```
(웹 변경 반영 필요 시) 웹 배포 → npx @bubblewrap/cli update    # 비밀번호 불필요
npx @bubblewrap/cli build                                        # 키스토어 비밀번호 2개 프롬프트
→ app-release-signed.apk (테스트) + app-release-bundle.aab (스토어)
```

의존 환경: `~/.bubblewrap/`의 JDK(x64로 교체됨)·Android SDK·config.json, SDK 라이선스 동의 해시
(`~/.bubblewrap/android_sdk/licenses/`). 전부 레포 밖 — 새 PC에서는 bubblewrap이 재설치 유도.

## 커스텀 코드 현황

Java 3개(Application·LauncherActivity·DelegationService) 전부 Google 보일러플레이트 그대로, 본문 사실상 비어 있음.
**커스텀 로직 0줄이 이 디렉토리의 설계 목표다** — 앱 고유 동작이 필요해지면 여기에 Java를 넣는 게 아니라
웹(charty-web)에 넣는 것이 원칙. (예: 스플래시·테마·회전 정책 전부 웹/manifest에서 해결했음)
