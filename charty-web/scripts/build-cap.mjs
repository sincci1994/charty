// iOS Capacitor용 정적 export 빌드 — CAPACITOR=1로 next.config의 output:'export' 분기를 켠다.
// cross-env 의존성 대신 node 스크립트 (Windows/macOS 공용). 사용: npm run build:cap
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'

// 로컬 번들엔 /data 폴백이 없다 — CDN 절대 URL 필수. next build가 .env.local을 직접 읽으므로 여기선 존재만 검사
const envOk = process.env.NEXT_PUBLIC_DATA_URL?.startsWith('http')
  || ['.env.local', '.env'].some((f) => existsSync(f) && /NEXT_PUBLIC_DATA_URL=https?:\/\//.test(readFileSync(f, 'utf8')))
if (!envOk) throw new Error('NEXT_PUBLIC_DATA_URL(절대 URL) 필요 — .env.local 확인 (로컬 번들엔 /data 폴백 없음)')

process.env.CAPACITOR = '1'
const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true, env: process.env })
if (r.status) process.exit(r.status)

// 번들 다이어트: data(21MB, 매일 낡음 — 런타임 CDN 로드)·.well-known(안드로이드 전용)은 제외
for (const d of ['out/data', 'out/.well-known']) rmSync(d, { recursive: true, force: true })
console.log('build:cap done -> out/ (data·.well-known 제외)')
