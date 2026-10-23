import { resolve } from 'node:path';
import base from '../../vite.config';

export default {
  ...base,
  root: resolve(__dirname, '../..'),
  cacheDir: resolve(__dirname, '../../.cache/plan-lifecycle-20261023-vite'),
  optimizeDeps: { entries: ['dev-docs/plan-lifecycle-20261023/preview.html'], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source'] },
  server: { ...base.server, host: '127.0.0.1', port: 4349, strictPort: true },
};
