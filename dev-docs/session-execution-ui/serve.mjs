import { createServer } from "vite";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

process.env.MYAGENTS_BUILD_PROFILE = "moxbot";
const root = resolve(import.meta.dirname, "../..");
const server = await createServer({
  configFile: resolve(root, "vite.config.ts"),
  cacheDir: resolve(tmpdir(), "moxbots-session-execution-ui-vite"),
  optimizeDeps: { entries: [resolve(import.meta.dirname, "fixture.tsx")] },
  server: { host: "127.0.0.1", port: 8938, strictPort: true, fs: { allow: [root] } },
  plugins: [{ name: "isolated-session-execution-ui", configResolved(config) { config.server.proxy = undefined; }, configureServer(vite) {
    vite.middlewares.use("/session-execution-ui", async (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml("/session-execution-ui", `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{min-height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/session-execution-ui/fixture.tsx"></script></body></html>`));
    });
  } }],
});
await server.listen();
console.log("http://127.0.0.1:8938/session-execution-ui");
