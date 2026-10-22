import { resolve } from 'node:path';
import base from '../../vite.config';
export default {
  ...base,
  root: resolve(__dirname, '../..'),
  cacheDir: resolve(__dirname, '../../.cache/session-orchestration-vite'),
  optimizeDeps: { entries: ['dev-docs/session-orchestration/preview.html'], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source'] },
  server: { ...base.server, host: '127.0.0.1', port: 4337, strictPort: true },
};
