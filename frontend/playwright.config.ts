import { defineConfig, devices } from '@playwright/test'

// PW_CHANNEL=chrome — запуск через установленный Chrome, если скачать браузеры Playwright нельзя
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}

// Порт не совпадает со старым фронтом (4173) и бэком (3000)
const port = 3100
const http = process.env.E2E_API === 'http'
if (process.env.E2E_API && !http) throw new Error('E2E_API must be http or omitted (mock suite)')
if (http && !process.env.NEXT_PUBLIC_API_BASE_URL) throw new Error('HTTP E2E requires NEXT_PUBLIC_API_BASE_URL')
const serverEnv: Record<string, string> = http ? {
  NEXT_PUBLIC_API_MODE: 'http',
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL!,
  API_BASE_URL: process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL!,
  NEXT_PUBLIC_ENABLE_TEST_MOCKS: '0',
} : {
  NEXT_PUBLIC_API_MODE: 'mock',
  NEXT_PUBLIC_ENABLE_TEST_MOCKS: '1',
}

export default defineConfig({
  testDir: './e2e',
  testMatch: http ? '**/http.spec.ts' : '**/*.spec.ts',
  testIgnore: http ? [] : ['**/http.spec.ts'],
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
    // Never reuse a server built for another data mode.
    reuseExistingServer: false,
    env: { ...serverEnv, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${port}` },
    timeout: 180_000,
  },
})
