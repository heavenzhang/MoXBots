import { resolve } from "node:path";
import base from "../../vite.config";
export default {
  ...base,
  root: resolve(__dirname, "../.."),
  optimizeDeps: { entries: ["dev-docs/unified-statusbar/preview.html"] },
  resolve: {
    ...base.resolve,
    alias: [
      {
        find: /^@\/context\/TabContext$/,
        replacement: resolve(__dirname, "fixture.tsx"),
      },
      ...(base.resolve!.alias as []),
    ],
  },
  server: { ...base.server, host: "127.0.0.1", port: 5197, strictPort: true },
};
