// Actual RemoteSession + product CSS; only the authenticated transport is synthetic.
// No real account, remote execution, external network or user's Chrome is used.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium, webkit } from "playwright";
const repo = resolve(import.meta.dirname, "..");
const output = await mkdtemp(resolve(tmpdir(), "remote-session-ui-"));
const engine = process.argv[2] ?? "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const scope = {
  serviceId: "service",
  environment: "test",
  principalId: "p",
  networkId: "n",
  deviceId: "d",
  keyGeneration: 2,
};
const snapshot = {
  kind: "snapshot",
  agentId: "a",
  sessionId: "s",
  generation: "g",
  turnId: "turn",
  revision: "1",
  state: "idle",
  terminal: null,
  title: "远程会话界面回归 · 长内容显示",
  runtime: "builtin",
  model: "model-" + "x".repeat(120),
  messages: [
    {
      id: "u",
      role: "user",
      timestamp: "",
      content: "检查报告并确认结果。",
      truncated: false,
      tools: [],
    },
    ...[0, 1, 2, 3, 4].map((i) => ({
      id: "bash" + i,
      role: "assistant",
      timestamp: "",
      content: "",
      truncated: false,
      tools: [
        {
          id: "b" + i,
          name: "Bash",
          status: "complete",
          summary: "command completed",
        },
      ],
    })),
    {
      id: "read",
      role: "assistant",
      timestamp: "",
      content: "",
      truncated: false,
      tools: [
        {
          id: "r",
          name: "Read",
          status: "complete",
          summary:
            "报告正文\n" +
            "长内容与换行\n".repeat(30) +
            "https://example.invalid/" +
            "a".repeat(500),
        },
      ],
    },
    {
      id: "err",
      role: "assistant",
      timestamp: "",
      content: "",
      truncated: false,
      tools: [
        { id: "e", name: "Bash", status: "error", summary: "command failed" },
      ],
    },
  ],
  interactions: [],
  hasMoreBefore: false,
  nextBefore: null,
};
const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {i18n} from './i18n';import {ThemeRuntimeProvider} from './theme/ThemeRuntime';import './index.css';import RemoteSession from './features/remote-session/RemoteSession';import {ImagePreviewProvider} from './context/ImagePreviewContext';
void i18n.changeLanguage('zh-CN');
const tab={id:'test',view:'remote-session',title:'Remote',locator:{connectionId:'owned:test',principalId:'p',networkId:'n',deviceId:'d',authGeneration:4},agentId:'a',agentName:'测试 Agent',deviceName:'Test Host',sessionId:'s',targetScope:${JSON.stringify(scope)}};
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={null}><ImagePreviewProvider><RemoteSession tab={tab} isActive binding={{onOpen(){},onBound(){}}}/></ImagePreviewProvider></ThemeRuntimeProvider>);`;
const transport = `const scope=${JSON.stringify(scope)};const snapshot=${JSON.stringify(snapshot)};window.remoteCalls=[];export const remoteAccountMatches=()=>true;export const remoteErrorCode=e=>e.code;export async function remoteSessionRequest(l,s,r){window.remoteCalls.push(r);return {scope,data:r.kind==='capabilities'?{kind:'capabilities',version:1,agentId:'a',runtime:'builtin',maxActiveSessions:1,liveUpdates:'snapshot'}:r.kind==='get'?snapshot:{kind:'receipt',agentId:'a',sessionId:'s',operationId:r.operationId,status:'accepted',code:null}}}`;
const entryId = repo + "/src/renderer/__remote_ui_audit.tsx";
const server = await createServer({
  configFile: resolve(repo, "vite.config.ts"),
  cacheDir: resolve(output, "vite-cache"),
  optimizeDeps: {
    exclude: ["chartjs-umd-source", "d3-umd-source", "lucide-umd-source"],
  },
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "remote-session-fixture",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/features/remote-session/RemoteSession.tsx"))
          return code
            .replaceAll("@/api/remoteSession", "/__remote_transport")
            .replaceAll("@/features/agent-network/store", "/__remote_registry");
      },
      resolveId(id, importer) {
        if (id === "/__remote_transport") return "\0remote-transport";
        if (id === "/__remote_registry") return "\0remote-registry";
        if (id === "/__remote_ui_audit.tsx") return entryId;
        if (importer?.endsWith("/features/remote-session/RemoteSession.tsx")) {
          if (id === "@/api/remoteSession") return "\0remote-transport";
          if (id === "@/features/agent-network/store")
            return "\0remote-registry";
        }
      },
      load(id) {
        if (id === entryId) return fixture;
        if (id === "\0remote-transport") return transport;
        if (id === "\0remote-registry")
          return `export const useAgentNetworkRegistry=()=>({connections:[{id:'owned:test',snapshot:{state:'ready',principalId:'p',networkId:'n',authGeneration:4}}]})`;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/__remote_ui_audit") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await vite.transformIndexHtml(
              "/__remote_ui_audit",
              '<html><head></head><body><div id="root" style="height:100dvh;width:100%;overflow:hidden"></div><script type="module" src="/__remote_ui_audit.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
let browser;
const checks = [];
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__remote_ui_audit`;
  browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error("BROWSER:", m.text());
  });
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR:", e.message);
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  for (const [width, height] of [
    [1440, 900],
    [800, 700],
    [390, 844],
  ]) {
    for (const colorScheme of ["light", "dark"]) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto(url);
      const read = page.getByRole("button", { name: /Read/ });
      try {
        await read.waitFor({ timeout: 15000 });
      } catch (error) {
        console.error(await page.locator("body").innerText());
        console.error("calls", await page.evaluate(() => window.remoteCalls));
        await page.screenshot({ path: resolve(output, "failure.png") });
        throw error;
      }
      await read.focus();
      await page.keyboard.press("Enter");
      await page.getByText("报告正文", { exact: false }).waitFor();
      assert.equal(
        await page.locator("pre").filter({ hasText: "filePath" }).count(),
        0,
      );
      const input = page.getByRole("textbox");
      await input.fill("长输入-" + "a".repeat(1200));
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.type("second line");
      assert.ok((await input.inputValue()).includes("\n"));
      const geometry = await page.evaluate(() => {
        const input = document.querySelector("textarea");
        const send = document.querySelector("button[type=submit]");
        const r = input.getBoundingClientRect(),
          b = send.getBoundingClientRect();
        return {
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          inputOverflow: input.scrollWidth > input.clientWidth + 1,
          inputRight: r.right,
          sendBottom: b.bottom,
          viewport: innerWidth,
          height: innerHeight,
        };
      });
      assert.equal(geometry.pageOverflow, false);
      assert.equal(geometry.inputOverflow, false);
      assert.ok(geometry.inputRight <= width);
      assert.ok(geometry.sendBottom <= height);
      // Poll replacements must preserve the user's open disclosure and draft.
      await page.waitForFunction(
        () => window.remoteCalls.filter((r) => r.kind === "get").length >= 2,
      );
      assert.equal(await read.getAttribute("aria-expanded"), "true");
      assert.ok((await input.inputValue()).includes("second line"));
      await page.screenshot({
        path: resolve(output, `${engine}-${width}-${colorScheme}.png`),
      });
      await read.click();
      assert.equal(await read.getAttribute("aria-expanded"), "false");
      const send = page.getByRole("button", { name: "发送", exact: true });
      await send.click();
      await page.waitForFunction(
        () => window.remoteCalls.filter((r) => r.kind === "send").length === 1,
      );
      assert.equal(await input.inputValue(), "");
      checks.push({
        width,
        height,
        colorScheme,
        geometry,
        keyboardDisclosure: true,
        pollPreserved: true,
        singleSend: true,
      });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify({ engine, checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ output, engine, cases: checks.length, status: "passed" }),
  );
} finally {
  await browser?.close();
  await server.close();
}
