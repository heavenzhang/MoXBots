import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from '../../../vite.config.ts';

export default mergeConfig(base, defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  cacheDir: join(tmpdir(), 'moxbots-error-continue-20261028-vite'),
  optimizeDeps: { entries: ['dev-docs/error-continue-20261028/evidence/ui.html'] },
  server: { host: '127.0.0.1', port: 4348, strictPort: true, proxy: {} },
}));
