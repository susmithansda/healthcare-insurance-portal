import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 45000, workers: 1, reporter: 'list',
  webServer: process.env.QA_URL ? undefined : [
    {command:'node e2e/server.mjs',url:'http://127.0.0.1:4001/api/health',timeout:30000},
    {command:'npm run dev:client -- --port 5175 --strictPort',url:'http://127.0.0.1:5175',env:{CARECLAIM_API_TARGET:'http://127.0.0.1:4001'},timeout:30000},
  ],
  use: { baseURL: process.env.QA_URL || 'http://127.0.0.1:5175', viewport: { width: 1440, height: 1100 }, launchOptions: { executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, screenshot: 'only-on-failure' },
});
