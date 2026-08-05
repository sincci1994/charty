'use client'
import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// react-router와 동일한 호출 형태(nav('/x'), nav('/x', { replace: true })) 유지용 래퍼
export function useNav() {
  const router = useRouter()
  return useCallback(
    (to: string, opts?: { replace?: boolean }) => {
      if (opts?.replace) router.replace(to)
      else router.push(to)
    },
    [router],
  )
}

// react-router <Navigate> 대체 — 렌더 중 조건부 리다이렉트 (항상 replace)
export function Navigate({ to }: { to: string; replace?: boolean }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(to)
  }, [router, to])
  return null
}
