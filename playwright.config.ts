import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout (agent Tests / équilibrage).
 * `npm run e2e` construit le jeu, le sert avec `vite preview` et lance Chromium.
 * WebGL passe par SwiftShader (logiciel) : on avance la simulation à la main (`window.bot.runFast`)
 * plutôt que d'attendre le temps réel.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  fullyParallel: true,
  retries: 1,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
});
