// Runs the actual renderer in browser-development mode. No native Sidecar,
// real account, user config or production application is started.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
process.env.MYAGENTS_BUILD_PROFILE = 'moxbot';
const root = resolve(import.meta.dirname, '../..');
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve(tmpdir(), 'moxbots-session-windows-vite'),
  server: { host: '127.0.0.1', port: 8898, strictPort: true },
  plugins: [{ name: 'isolated-shell-validation', configResolved(config) { config.server.proxy = undefined; } }],
});
await server.listen();
console.log('http://127.0.0.1:8898/ — isolated MoXBots renderer (synthetic browser storage)');
