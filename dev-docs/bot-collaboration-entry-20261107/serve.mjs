// Local-only production component fixture; no native app, account, model or sidecar.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
process.env.MYAGENTS_BUILD_PROFILE = 'moxbot';
const root = resolve(import.meta.dirname, '../..');
const fixture = resolve(import.meta.dirname, 'fixture.tsx');
const server = await createServer({ configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(tmpdir(), 'mox-collaboration-entry-qa'),
 optimizeDeps: { entries: [fixture], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source'] },
 server: { host: '127.0.0.1', port: 8927, strictPort: true, fs: { allow: [root] } },
 plugins: [{ name: 'collaboration-fixture', enforce: 'pre',
 resolveId(id) { if (id.endsWith('/hooks/useTaskCenterData') || id.endsWith('/agent-status/useSessionTaskOrchestration')) return resolve(import.meta.dirname, 'state.ts'); },
 configResolved(config) { config.server.proxy = undefined; },
 configureServer(server) { server.middlewares.use('/collaboration-qa', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/collaboration-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${fixture}"></script></body></html>`)); }); }
 }] });
await server.listen(); console.log('http://127.0.0.1:8927/collaboration-qa');
