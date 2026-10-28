import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from '../../../vite.config';
export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5398, strictPort: true },
});
