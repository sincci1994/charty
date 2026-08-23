import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Shell from './shell'
import '../src/index.css'

export const metadata: Metadata = {
  title: '차티 — 모의투자 훈련',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B1226' },
    { media: '(prefers-color-scheme: light)', color: '#F5F5F7' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
