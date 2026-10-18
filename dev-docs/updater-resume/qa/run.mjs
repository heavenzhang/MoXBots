import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
process.env.MYAGENTS_BUILD_PROFILE = "moxbot";
const repo = resolve(import.meta.dirname, "../../..");
const out = "/private/tmp/moxbots-updater-resume-uiqa-20261018";
await mkdir(out, { recursive: true });
const fixture = resolve(import.meta.dirname, "extracted.tsx");
const source = await readFile(
  resolve(repo, "src/renderer/pages/settings/SettingsPage.tsx"),
  "utf8",
);
const fragment = source.slice(
  source.indexOf("{activeSection === 'about' && ("),
  source.indexOf("{/* Developer page - unlocked"),
);
const pre = `import React,{useState} from 'react';import {i18n} from '@/i18n';import {MyAgentsLogotype} from '@/components/brand/MyAgentsLogotype';import {APP_BUILD_PROFILE,APP_DISPLAY_NAME,APP_WEBSITE_URL} from '@/../shared/appProfile';import {MYAGENTS_GITHUB_URL,MYAGENTS_RELEASES_URL,MYAGENTS_SOURCE_CODE_URL} from '@/pages/settings/settingsSections';import {UpdateDownloadStatus} from '@/components/UpdateDownloadStatus';import {IDLE_UPDATER_DOWNLOAD} from '@/../shared/updaterDownload';import {LoaderIcon} from '@/components/icons';const ExternalLink=({href,children,...props})=><a {...props} href={href}>{children}</a>;export default function About(){const [updateDownloadState,setState]=useState(IDLE_UPDATER_DOWNLOAD);window.setDownload=(patch)=>setState({...IDLE_UPDATER_DOWNLOAD,revision:1,...patch});const tSettings=(k,o)=>i18n.t(k,{ns:'settings',...o}),tApp=(k)=>i18n.t(k,{ns:'app'});const activeSection='about',handleLogoTap=()=>{},appVersion='0.5.11 synthetic',linuxDesktop=false,propUpdateReady=updateDownloadState.phase==='ready',updateDownloading=['downloading','retrying'].includes(updateDownloadState.phase),onCheckForUpdate=async()=>{window.auditEvents.push('check_and_download_update');setState(s=>({...s,phase:'checking',revision:s.revision+1}));return 'downloading'},updateChecking=updateDownloadState.phase==='checking',propUpdateVersion=updateDownloadState.version,updatePreparing=['checking','downloading','retrying'].includes(updateDownloadState.phase),updateInstalling=false,onRestartAndUpdate=()=>window.auditEvents.push('explicit-restart'),updateConfig=()=>{},config={},setShowBugReport=()=>{},qrCodeLoading=false,qrCodeDataUrl=null,sourceLicenseUrl=MYAGENTS_GITHUB_URL+'/blob/main/LICENSE',sourceNoticesUrl=MYAGENTS_GITHUB_URL+'/blob/main/THIRD_PARTY_NOTICES.md',openOwnedCloudPage=()=>{},toast={error:()=>{},info:()=>{}};return <>`;
await writeFile(fixture, pre + fragment + "</>}");
await writeFile(
  resolve(import.meta.dirname, "fixture.tsx"),
  `import React from 'react';import {createRoot} from 'react-dom/client';import {i18n} from '@/i18n';import {ThemeRuntimeProvider} from '@/theme/ThemeRuntime';import '@/index.css';import About from './extracted';await i18n.changeLanguage('zh-CN');window.auditEvents=[];createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={null}><main style={{maxWidth:850,margin:'auto',padding:24}}><About/></main></ThemeRuntimeProvider>);`,
);
const server = await createServer({
  configFile: resolve(repo, "vite.config.ts"),
  cacheDir: resolve(out, "vite-cache"),
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "updater-qa",
      configureServer(v) {
        v.middlewares.use(async (req, res, next) => {
          if (req.url !== "/__updater") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await v.transformIndexHtml(
              req.url,
              `<html><body style="margin:0"><div id="root"></div><script type="module" src="/@fs/${resolve(import.meta.dirname, "fixture.tsx")}"></script></body></html>`,
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
const cache = resolve(homedir(), "Library/Caches/ms-playwright");
const exe = readdirSync(cache)
  .filter((n) => n.startsWith("chromium_headless_shell-"))
  .sort()
  .reverse()
  .map((n) =>
    resolve(cache, n, "chrome-headless-shell-mac-arm64/chrome-headless-shell"),
  )
  .find(existsSync);
const browser = await chromium.launch({ executablePath: exe });
const p = await browser.newPage();
const errors = [];
const cases = [];
p.on("pageerror", (e) => errors.push(e.message));
const states = {
  checking: { phase: "checking" },
  known: {
    phase: "downloading",
    version: "0.5.12",
    downloaded: 50 * 1048576,
    total: 100 * 1048576,
    percent: 50,
    bytesPerSecond: 512 * 1024,
    attempt: 1,
    maxAttempts: 3,
  },
  unknown: {
    phase: "downloading",
    version: "0.5.12",
    downloaded: 2 * 1048576,
    bytesPerSecond: 128 * 1024,
    attempt: 1,
    maxAttempts: 3,
  },
  retrying: {
    phase: "retrying",
    version: "0.5.12",
    downloaded: 50 * 1048576,
    total: 100 * 1048576,
    percent: 50,
    attempt: 2,
    maxAttempts: 3,
    retryAtMs: Date.now() + 60000,
    errorCode: "timeout",
    error: "下载暂时无响应",
    retryable: true,
  },
  failed: {
    phase: "failed",
    version: "0.5.12",
    downloaded: 50 * 1048576,
    total: 100 * 1048576,
    percent: 50,
    attempt: 3,
    maxAttempts: 3,
    errorCode: "network",
    error:
      "连接中断，已保留下载内容。" +
      "这是用于测试较长失败原因的可读提示。".repeat(12),
    retryable: true,
  },
  ready: {
    phase: "ready",
    version: "0.5.12",
    downloaded: 100 * 1048576,
    total: 100 * 1048576,
    percent: 100,
  },
};
try {
  await p.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/__updater`,
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  await p.waitForFunction(
    () => typeof window.setDownload === "function",
    {},
    { timeout: 120000 },
  );
  for (const [width, height] of [
    [1200, 900],
    [390, 844],
  ]) {
    await p.setViewportSize({ width, height });
    for (const [name, state] of Object.entries(states)) {
      await p.evaluate((s) => window.setDownload(s), state);
      await p.waitForTimeout(200);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} ${width} overflow`,
      );
      if (name === "known") {
        assert.equal(
          await p.getByRole("progressbar").getAttribute("aria-valuenow"),
          "50",
        );
        assert((await p.locator("body").innerText()).includes("512 KB/s"));
      }
      if (name === "unknown")
        assert.equal(await p.getByRole("progressbar").count(), 0);
      if (name === "failed") {
        const button = p.getByRole("button", { name: "重试下载", exact: true });
        await button.focus();
        await p.keyboard.press("Enter");
        assert.deepEqual(await p.evaluate(() => window.auditEvents.slice(-1)), [
          "check_and_download_update",
        ]);
        await p.evaluate((s) => window.setDownload(s), state);
        await p.waitForTimeout(100);
        assert(
          (await p.locator("body").innerText()).includes("50.0 MB / 100.0 MB"),
        );
      }
      if (name === "ready")
        assert.equal(
          await p.getByRole("button", { name: "重启安装" }).count(),
          1,
        );
      if (name === "retrying")
        assert((await p.locator("body").innerText()).includes("3"));
      await p.screenshot({
        path: resolve(out, `${name}-${width}.png`),
        fullPage: true,
      });
      cases.push({ name, width, height, pass: true });
    }
  }
  assert.deepEqual(errors, []);
} catch (error) {
  cases.push({ name: "failure", pass: false, error: error.message });
  await p.screenshot({ path: resolve(out, "failure.png"), fullPage: true });
  process.exitCode = 1;
} finally {
  const files = [
    "src/renderer/pages/settings/SettingsPage.tsx",
    "src/renderer/components/UpdateDownloadStatus.tsx",
  ];
  const hashes = {};
  for (const f of files)
    hashes[f] = createHash("sha256")
      .update(await readFile(resolve(repo, f)))
      .digest("hex");
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify(
      {
        scope:
          "Actual About JSX extracted unchanged; synthetic Settings owner state and callbacks. Browser component/interaction verification, not native Tauri or real IPC acceptance.",
        reviewer: "root (independent worker unavailable after usage limit)",
        cases,
        errors,
        hashes,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ cases, errors }));
  await browser.close();
  await server.close();
}
