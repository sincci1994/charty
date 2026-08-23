'use client'
import { Suspense } from 'react'
import CustomStyle from '../../../../src/screens/CustomStyle'

// useSearchParams는 프리렌더 시 Suspense 경계 필요 (Next 정적 export 요건)
export default function Page() {
  return (
    <Suspense>
      <CustomStyle />
    </Suspense>
  )
}
