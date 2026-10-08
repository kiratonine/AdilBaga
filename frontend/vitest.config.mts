import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    env: { NEXT_PUBLIC_API_MODE: 'mock', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
