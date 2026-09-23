import { defineConfig, devices } from '@playwright/test'

// PW_CHANNEL=chrome — запуск через установленный Chrome, если скачать браузеры Playwright нельзя
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...channel } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', ...channel } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_API_MODE: 'mock' },
    timeout: 120_000,
  },
})
