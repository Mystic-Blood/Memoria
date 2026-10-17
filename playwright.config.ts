import { defineConfig, devices } from '@playwright/test'

// Supabase keys for creating and deleting the throwaway test user.
try { process.loadEnvFile('.env.local') } catch { /* CI provides env vars directly */ }

/**
 * End-to-end tests drive a real browser against a RUNNING app with the real database and models:
 *   npm run build && npm start   (or npm run dev), then: npm run e2e
 * Local models are slow on a laptop GPU, so timeouts are generous.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 6 * 60_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
