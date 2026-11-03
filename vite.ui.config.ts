// Build de la maquette d'interface (agent 6) : npm run ui:preview / ui:build → dist-ui/
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, defineConfig({
  build: { outDir: 'dist-ui', rollupOptions: { input: 'ui-preview.html' } },
  server: { open: '/ui-preview.html' },
}));
