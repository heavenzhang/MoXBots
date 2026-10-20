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
const pagingOnly = process.argv.includes("--paging-only");
assert.ok(["chromium", "webkit"].includes(engine));
async function settleAnchor(page, messageId) {
  return page.evaluate((id) => new Promise((resolve, reject) => {
    let previous = '', stable = 0, frames = 0;
    const sample = () => {
      const row = document.querySelector(`[data-chat-search-scope][data-message-id="${id}"]`);
      const scroller = document.querySelector('[data-virtuoso-scroller]');
      const y = row?.getBoundingClientRect().top;
      const geometry = `${y}:${scroller?.scrollTop}:${scroller?.scrollHeight}`;
      stable = geometry === previous ? stable + 1 : 0;
      previous = geometry;
      if (row && stable >= 15) return resolve(y);
      if (++frames >= 180) return reject(new Error('Reading geometry did not settle'));
      requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  }), messageId);
}
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
  hasMoreBefore: true,
  nextBefore: "u",
};
const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {i18n} from './i18n';import {ThemeRuntimeProvider} from './theme/ThemeRuntime';import './index.css';import RemoteSession from './features/remote-session/RemoteSession';import {ImagePreviewProvider} from './context/ImagePreviewContext';import {ConfigDataContext} from './config/ConfigProvider';import {DEFAULT_CONFIG} from './config/types';import {ToastProvider} from './components/Toast';import SimpleChatInput from './components/SimpleChatInput';import MessageList from './components/MessageList';import {useChatScrollController} from './hooks/useChatScrollController';import {useChatScrollModel} from './hooks/useChatScrollModel';import {presentRemoteTranscript} from './features/remote-session/transcriptPresentation';
void i18n.changeLanguage('zh-CN');
const tab={id:'test',view:'remote-session',title:'Remote',locator:{connectionId:'owned:test',principalId:'p',networkId:'n',deviceId:'d',authGeneration:4},agentId:'a',agentName:'测试 Agent',deviceName:'Test Host',sessionId:'s',targetScope:${JSON.stringify(scope)}};
const fixtureMessages=presentRemoteTranscript(${JSON.stringify(snapshot.messages)},'Partial history');
function OrdinaryChat(){
  const root=React.useRef(null);
  const [height,setHeight]=React.useState(176);
  const [messages,setMessages]=React.useState(fixtureMessages);
  const [olderCount,setOlderCount]=React.useState(0);
  const model=useChatScrollModel({historyMessages:messages,streamingMessage:null,firstItemIndex:100000-olderCount,sessionId:'local-fixture'});
  const scroll=useChatScrollController({messages:model.data,isActive:true,sessionId:'local-fixture',rootRef:root});
  React.useEffect(()=>{
    window.prependOrdinary=()=>{
      scroll.pauseAutoScroll();
      const anchor=scroll.captureAnchor('prepend-older');
      if(anchor)scroll.preserveAnchorAfterPrepend(anchor);
      setMessages(previous=>[...presentRemoteTranscript(Array.from({length:25},(_,i)=>({id:'old-'+i,role:'user',timestamp:'',content:'历史消息 '+i,truncated:false,tools:[]})),''),...previous]);
      setOlderCount(25);
    };
    window.appendOrdinary=()=>setMessages(previous=>[...previous,{id:'tail',role:'assistant',timestamp:new Date(),content:'后续输出保持阅读位置'}]);
  },[scroll]);
  return <div ref={root} style={{position:'relative',height:'100dvh',display:'flex',flexDirection:'column'}}><header style={{padding:16}}>普通会话 · 共用组件对照</header><div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}><MessageList messages={model.data} streamingMessage={null} isLoading={false} isActive sessionId="local-fixture" firstItemIndex={model.firstItemIndex} heightEstimateSeed={model.heightEstimateSeed} layoutByMessageId={model.layoutByMessageId} virtuosoRef={scroll.virtuosoRef} onScrollerRef={scroll.attachScroller} followEnabledRef={scroll.followEnabledRef} scrollToBottom={scroll.scrollToBottom} handleAtBottomChange={scroll.handleAtBottomChange} onRowLayoutChanged={scroll.onRowLayoutChanged} onViewportAdmissionChanged={scroll.onViewportAdmissionChanged} onItemsRendered={scroll.onItemsRendered} bottomSpacerPx={height}/></div><SimpleChatInput onSend={()=>true} isLoading={false} providerAvailable runtime="builtin" sessionId="local-fixture" onOverlayHeightChange={setHeight}/></div>
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={null}><ConfigDataContext.Provider value={{config:DEFAULT_CONFIG,projects:[],providers:[],apiKeys:{},providerVerifyStatus:{},isLoading:false}}><ToastProvider><ImagePreviewProvider>{location.search.includes('ordinary')?<OrdinaryChat/>:<RemoteSession tab={tab} isActive binding={{onOpen(){},onBound(){}}}/>}</ImagePreviewProvider></ToastProvider></ConfigDataContext.Provider></ThemeRuntimeProvider>);`;
const transport = `const scope=${JSON.stringify(scope)};const snapshot=${JSON.stringify(snapshot)};window.remoteCalls=[];window.remoteSnapshot=snapshot;export const remoteAccountMatches=()=>true;export const remoteErrorCode=e=>e.code;export async function remoteSessionRequest(l,s,r){window.remoteCalls.push(r);return {scope,data:r.kind==='capabilities'?{kind:'capabilities',version:1,agentId:'a',runtime:'builtin',maxActiveSessions:1,liveUpdates:'snapshot'}:r.kind==='get'?JSON.parse(JSON.stringify(r.before?{...snapshot,messages:Array.from({length:25},(_,i)=>({id:'old-'+i,role:'user',timestamp:'',content:'历史消息 '+i,truncated:false,tools:[]})),hasMoreBefore:false,nextBefore:null}:snapshot)):{kind:'receipt',agentId:'a',sessionId:'s',operationId:r.operationId,status:'accepted',code:null}}}`;
const entryId = resolve(output, "entry.tsx");
const fixtureSource = fixture
  .replaceAll("from './", `from '${repo}/src/renderer/`)
  .replaceAll("import './", `import '${repo}/src/renderer/`);
await writeFile(entryId, fixtureSource);
const server = await createServer({
  configFile: resolve(repo, "vite.config.ts"),
  cacheDir: resolve(output, "vite-cache"),
  optimizeDeps: {
    entries: [entryId],
    exclude: [
      "chartjs-umd-source",
      "d3-umd-source",
      "lucide-umd-source",
      "chartjs-umd-source?raw",
      "d3-umd-source?raw",
      "lucide-umd-source?raw",
    ],
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
        if (id === entryId) return fixtureSource;
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
const styles = [];
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
    if (m.type() === "error") {
      consoleErrors.push(m.text());
      console.error("BROWSER:", m.text());
    }
  });
  const errors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR:", e.message);
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  for (const [width, height] of (pagingOnly ? [[800,700]] : [[1440,900],[800,700],[390,844]])) {
    for (const colorScheme of (pagingOnly ? ["dark"] : ["light", "dark"])) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto(url);
      const read = page.locator(
        '[data-chat-search-scope][data-message-id="read"] [data-process-row] > button[aria-expanded]',
      );
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
      await page.locator("pre").filter({ hasText: "报告正文" }).waitFor();
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
        const send = document.querySelector('button[aria-label="发送"]');
        const r = input.getBoundingClientRect(),
          b = send.getBoundingClientRect();
        const timeline = document.querySelector('[data-virtuoso-scroller]').getBoundingClientRect();
        const composer = input.closest('[data-composer-surface]').getBoundingClientRect();
        return {
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          inputOverflow: input.scrollWidth > input.clientWidth + 1,
          inputRight: r.right,
          sendBottom: b.bottom,
          viewport: innerWidth,
          height: innerHeight,
          timelineTop: timeline.top,
          timelineBottom: timeline.bottom,
          composerTop: composer.top,
        };
      });
      assert.equal(geometry.pageOverflow, false);
      assert.equal(geometry.inputOverflow, false);
      assert.ok(geometry.inputRight <= width);
      assert.ok(geometry.sendBottom <= height);
      assert.ok(geometry.timelineBottom <= geometry.composerTop + 1, 'Flow composer and timeline must not overlap');
      assert.ok(geometry.timelineBottom > geometry.timelineTop, 'Timeline keeps a measurable viewport');
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
      styles.push(
        await page.locator("textarea").evaluate((el) => {
          const c = getComputedStyle(el);
          return {
            font: c.fontSize,
            line: c.lineHeight,
            overflowX: c.overflowX,
            radius: getComputedStyle(el.closest("[data-composer-surface]"))
              .borderRadius,
          };
        }),
      );
      let prependAnchor = null;
      if (width === 800 && colorScheme === "dark") {
        const scroller = page.locator("[data-virtuoso-scroller]").first();
        await scroller.hover();
        await page.mouse.wheel(0, -10000);
        const older = page.getByRole("button").filter({ hasText: "更早" });
        await older.scrollIntoViewIfNeeded();
        const beforeY = await settleAnchor(page, "u");
        await older.click();
        await page.waitForFunction(() =>
          window.remoteCalls.some((r) => r.kind === "get" && r.before),
        );
        const afterY = await settleAnchor(page, "u");
        assert.ok(Math.abs(afterY - beforeY) < 3,
          'Prepend must retain the reading anchor after measurement settles');
        prependAnchor = { beforeY, afterY };
        const countBefore = await page.evaluate(
          () => window.remoteCalls.filter((r) => r.kind === "get").length,
        );
        await page.evaluate(() => {
          window.remoteSnapshot.messages.push({
            id: "new-tail",
            role: "assistant",
            timestamp: "",
            truncated: false,
            content: "后续输出保持阅读位置",
            tools: [],
          });
          window.remoteSnapshot.revision = "updated-tail";
        });
        await page.waitForFunction(
          (count) =>
            window.remoteCalls.filter((r) => r.kind === "get").length > count,
          countBefore,
        );
        const readingAfterY = await settleAnchor(page, "u");
        if (Math.abs(readingAfterY - beforeY) >= 3)
          await page.screenshot({ path: resolve(output, 'tail-reading-failure.png') });
        assert.ok(
          Math.abs(readingAfterY - beforeY) < 3,
          "New tail must not pull a reader away from older history",
        );
        await scroller.hover();
        await page.mouse.wheel(0, 10000);
        await page.getByText("后续输出保持阅读位置", { exact: true }).waitFor();
        prependAnchor.readingAfterNewTailY = readingAfterY;
        prependAnchor.newTailReachable = true;
      }
      checks.push({
        prependAnchor,
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
  const ordinary = [];
  for (const [width, height] of (pagingOnly ? [] : [[1440,900],[800,700],[390,844]])) {
    for (const colorScheme of (pagingOnly ? ["dark"] : ["light", "dark"])) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto(url + "?ordinary");
      const input = page.getByRole("textbox");
      await input.waitFor();
      await input.fill("同一输入组件 " + "a".repeat(500));
      const style = await input.evaluate((el) => {
        const c = getComputedStyle(el);
        return {
          font: c.fontSize,
          line: c.lineHeight,
          overflowX: c.overflowX,
          radius: getComputedStyle(el.closest("[data-composer-surface]"))
            .borderRadius,
        };
      });
      assert.deepEqual(style, styles[0]);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: resolve(output, `${engine}-ordinary-${width}-${colorScheme}.png`),
      });
      let prependAnchor = null;
      if (width === 800 && colorScheme === 'dark') {
        const scroller=page.locator('[data-virtuoso-scroller]').first();
        await scroller.hover();
        await page.mouse.wheel(0,-10000);
        const beforeY=await settleAnchor(page,'u');
        await page.evaluate(()=>window.prependOrdinary());
        await page.waitForFunction(()=>document.querySelector('[data-message-id="old-24"]'));
        const afterY=await settleAnchor(page,'u');
        assert.ok(Math.abs(afterY-beforeY)<3, 'Ordinary history prepend must preserve its reader');
        await page.evaluate(()=>window.appendOrdinary());
        const readingAfterNewTailY=await settleAnchor(page,'u');
        assert.ok(Math.abs(readingAfterNewTailY-beforeY)<3, 'Ordinary new tail must preserve its reader');
        prependAnchor={beforeY,afterY,readingAfterNewTailY};
      }
      ordinary.push({ width, height, colorScheme, style, prependAnchor });
    }
  }
  // The existing patched react-virtuoso scroll-extent element has no React key.
  // It warns identically in the ordinary baseline and remote consumer; record it,
  // and reject every other console error rather than mutating shared dependencies.
  assert.ok(
    consoleErrors.every(
      (message) =>
        message.startsWith("Each child in a list should have a unique") &&
        message.includes("fr"),
    ),
  );
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      { engine, checks, ordinary, errors, consoleErrors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      engine,
      cases: checks.length,
      ordinaryCases: ordinary.length,
      status: "passed",
    }),
  );
} finally {
  await browser?.close();
  await server.close();
}
