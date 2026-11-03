import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { pwa } from './tools/pwa.ts';

export default defineConfig({
  base: './',
  plugins: [pwa({ template: fileURLToPath(new URL('./src/pwa/sw-template.js', import.meta.url)) })],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
    },
  },
  build: { target: 'es2022', assetsDir: 'js', chunkSizeWarningLimit: 1500 },
  // Worker de cuisson des combattants (src/game/rig/bake.worker.ts) en module ES.
  worker: { format: 'es' },
  // tests/e2e : Playwright (npm run e2e), pas Vitest.
  test: { environment: 'node', exclude: ['tests/e2e/**', 'node_modules/**'] },
});
