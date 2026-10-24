import { createServer } from 'vite';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
process.env.MYAGENTS_BUILD_PROFILE = 'moxbot';
const root = resolve(import.meta.dirname, '../..');
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(tmpdir(), 'moxbots-unified-routing-vite'),
  optimizeDeps: { entries: [resolve(import.meta.dirname, 'fixture.tsx')], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source'] },
  server: { host: '127.0.0.1', port: 8937, strictPort: true, fs: { allow: [root] } },
  plugins: [{ name: 'isolated-model-settings', configResolved(config) { config.server.proxy = undefined; },
    configureServer(server) {
      server.middlewares.use('/api/', (req, res, next) => {
        if (/\.(ts|tsx|js|jsx)(\?|$)/.test(req.url ?? '')) return next();
        res.setHeader('Content-Type', 'application/json');
        if (req.url === 'admin/route/tiers' || req.url === '/admin/route/tiers') {
          res.end(JSON.stringify({ success: true, data: { enabled: true, classifier: { providerId: 'qa-provider', model: 'qa-fast' },
            tiers: Object.fromEntries(['fast', 'balanced', 'strong'].map(tier => [tier, [{ providerId: 'qa-provider', model: `qa-${tier}`, modelName: `验收 ${tier}` }]])) } }));
        } else res.end(JSON.stringify({ success: true, data: { models: [] } }));
      });
      server.middlewares.use('/unified-routing-qa', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/unified-routing-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/unified-routing-20261024/fixture.tsx"></script></body></html>`));
      });
    },
  }],
});
await server.listen();
console.log('http://127.0.0.1:8937/unified-routing-qa');
