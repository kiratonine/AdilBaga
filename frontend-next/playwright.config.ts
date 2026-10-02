import { defineConfig, devices } from '@playwright/test'

// PW_CHANNEL=chrome — запуск через установленный Chrome, если скачать браузеры Playwright нельзя
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}

// Порт не совпадает со старым фронтом (4173) и бэком (3000)
const port = 3100

export default defineConfig({
  testDir: './e2e',
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
    env: { NEXT_PUBLIC_API_MODE: 'mock' },
    timeout: 180_000,
  },
})
