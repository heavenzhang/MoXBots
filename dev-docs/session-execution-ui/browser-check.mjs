import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const out = resolve(import.meta.dirname, "evidence");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = "http://127.0.0.1:8938/session-execution-ui";
try {
  await page.goto(base);
  await page.getByText(/完成导出改进/).first().waitFor();
  const status = page.locator("[data-session-execution-status]");
  await page.getByText("等待模型恢复").waitFor();
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await status.isVisible());
    assert(!(await status.innerText()).includes("/8"));
    assert(await status.getByRole("button").getByText("等待模型恢复").isVisible());
    assert(!(await status.getByRole("button").innerText()).includes("运行中"));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(out, `waiting-model-recovery-${width}.png`), fullPage: true });
  }
  await status.getByRole("button").click();
  const longObjective = status.locator("div.break-words.font-medium");
  await longObjective.waitFor();
  await page.getByText(/模型正在恢复，已尝试/).waitFor();
  assert(["anywhere", "break-word"].includes(await longObjective.evaluate(el => getComputedStyle(el).overflowWrap)));
  assert(await longObjective.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await longObjective.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
    await page.screenshot({ path: resolve(out, `long-objective-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "recovery-paused" }).click();
  await page.getByText(/模型自动恢复已暂停/).first().waitFor();
  assert(await status.getByRole("button").getByText("模型恢复已暂停").isVisible());
  assert(!(await status.getByRole("button").innerText()).includes("运行中"));
  await page.getByRole("button", { name: "completed" }).click();
  await page.getByText("已完成").waitFor();
  assert(await status.getByRole("button").getByText("已完成").isVisible());
  assert(!(await status.innerText()).includes("模型自动恢复"));
  assert(!(await status.innerText()).includes("模型恢复已暂停"));
  await page.getByText("已证明覆盖 2/2 项").waitFor();
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(out, `completed-details-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "classification" }).click();
  await page.getByText("执行意图未确认 · 自动续跑未启用").waitFor();
  await page.getByRole("button", { name: "unknown" }).click();
  await page.getByText("执行状态暂不可确认").waitFor();
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, "browser-result.json"), JSON.stringify({ passed: true, environment: base, transport: "real SessionExecutionStatus with synthetic fixture states; isolated local Vite, no daily app or backend writes", viewports: ["1440x1000", "768x1024", "390x844"], checks: ["waiting/paused recovery replaces the running header state without a duplicate recovery badge", "long objective details wrap without horizontal or vertical clipping", "recovery is shown only while execution is active and matches its current queue", "terminal completed state takes precedence over stale recovery", "completed state exposes proven acceptance coverage", "classification failure is unconfirmed and continuation is not represented as active", "stale state is explicitly unknown", "no browser runtime errors"], errors }, null, 2));
  console.log(JSON.stringify({ passed: true, errors }));
} finally { await browser.close(); }
