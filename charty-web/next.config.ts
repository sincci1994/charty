import type { NextConfig } from 'next'

// CAPACITOR=1 — iOS 로컬 번들용 정적 export (scripts/build-cap.mjs가 설정). 평소엔 Vercel 서버 빌드 그대로.
// trailingSlash: 정적 서버에서 딥 리로드 시 /route/ → /route/index.html 해석용
const nextConfig: NextConfig = process.env.CAPACITOR === '1'
  ? { output: 'export', trailingSlash: true }
  : {}

export default nextConfig
