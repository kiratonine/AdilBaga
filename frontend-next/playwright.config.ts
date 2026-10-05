import { defineConfig, devices } from '@playwright/test'

// PW_CHANNEL=chrome — запуск через установленный Chrome, если скачать браузеры Playwright нельзя
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}

// E2E_API=http — прогон против живого бэка (e2e/http.spec.ts), иначе — моки.
// Порты не совпадают со старым фронтом (4173) и бэком (3000); у http свой — чтобы не переиспользовать mock-сервер.
// Сборка в .next общая: mock- и http-прогоны не запускать одновременно.
const http = process.env.E2E_API === 'http'
const port = http ? 3101 : 3100
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'

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
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // Каталог и дашборд пререндерятся при сборке — в http-режиме бэк должен быть уже запущен
    env: http ? { NEXT_PUBLIC_API_MODE: 'http', NEXT_PUBLIC_API_BASE_URL: apiBaseUrl } : { NEXT_PUBLIC_API_MODE: 'mock' },
    timeout: 180_000,
  },
})
