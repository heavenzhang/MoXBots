// Credential-free acceptance server. Never starts a Sidecar or reads user config.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
process.env.MYAGENTS_BUILD_PROFILE = 'moxbot';
const root = resolve(import.meta.dirname, '../..');
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(tmpdir(), 'moxbots-model-policy-vite'),
  optimizeDeps: { entries: [resolve(import.meta.dirname, 'fixture.tsx')], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source'] },
  server: { host: '127.0.0.1', port: 8931, strictPort: true, fs: { allow: [root] } },
  plugins: [{ name: 'isolated-model-policy', configResolved(config) { config.server.proxy = undefined; },
    configureServer(server) {
      server.middlewares.use('/api/', (req, res, next) => {
        if (/\.(ts|tsx|js|jsx)(\?|$)/.test(req.url ?? '')) return next();
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, data: {} }));
      });
      server.middlewares.use('/model-policy-qa', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/model-policy-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{min-height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/model-policy-20261022/fixture.tsx"></script></body></html>`));
      });
    },
  }],
});
await server.listen();
console.log('http://127.0.0.1:8931/model-policy-qa');
