import { resolve } from "node:path";
import base from "../../vite.config";
export default {
  ...base, root: resolve(__dirname, "../.."),
  cacheDir: resolve(__dirname, "../../.vite-composer-status"),
  optimizeDeps: { entries: ["dev-docs/composer-status-20261027/preview.html"] },
  resolve: { ...base.resolve, alias: [{ find: /^@\/context\/TabContext$/, replacement: resolve(__dirname, "fixture.tsx") }, ...(base.resolve!.alias as [])] },
  server: { host: "127.0.0.1", port: 5277, strictPort: true },
};
