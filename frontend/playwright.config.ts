import { defineConfig, devices } from '@playwright/test'

// PW_CHANNEL=chrome — запуск через установленный Chrome, если скачать браузеры Playwright нельзя
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}

// E2E_API=http — прогон против живого бэка (e2e/http.spec.ts), иначе — моки.
// Отдельный порт, чтобы не переиспользовать уже запущенный mock-preview.
const http = process.env.E2E_API === 'http'
const port = http ? 4174 : 4173
const apiBaseUrl = process.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  ...(http ? { testMatch: 'http.spec.ts' } : { testIgnore: 'http.spec.ts' }),
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...channel } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', ...channel } },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: http ? { VITE_API_MODE: 'http', VITE_API_BASE_URL: apiBaseUrl } : { VITE_API_MODE: 'mock' },
    timeout: 120_000,
  },
})
