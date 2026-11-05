import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import base from '../../vite.config';
export default { ...base, root: resolve(__dirname, '../..'),
 cacheDir: resolve(tmpdir(), 'moxbots-simple-results-20261106'),
 optimizeDeps: { entries: ['dev-docs/simple-ux-results-20261106/preview.html'] },
 server: { host: '127.0.0.1', port: 5387, strictPort: true },
};
