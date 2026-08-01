import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // 어떤 정적 호스팅 경로에서도 동작
  plugins: [react()],
})
