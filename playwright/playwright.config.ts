import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 412, height: 915 },
    video: 'off',
    trace: 'off',
    screenshot: 'only-on-failure',
    baseURL: 'http://localhost:3001',
  },
});
