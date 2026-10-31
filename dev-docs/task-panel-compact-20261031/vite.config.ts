import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'node:path';
import base from '../../vite.config';
export default mergeConfig(base, defineConfig({
  root: __dirname,
  cacheDir: '/tmp/mox-task-panel-compact-vite-cache',
  build: { outDir: '/tmp/mox-task-panel-compact-preview', emptyOutDir: true, rollupOptions: { input: resolve(__dirname, 'preview.html') } },
}));
