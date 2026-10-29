import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const output = new URL("./evidence/", import.meta.url);
await mkdir(output, { recursive: true });
const results = [], errors = [];
for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
 const browser = await type.launch({ headless: true, ...(process.env[engine === "chromium" ? "MOXBOTS_QA_CHROMIUM" : "MOXBOTS_QA_WEBKIT"] ? { executablePath: process.env[engine === "chromium" ? "MOXBOTS_QA_CHROMIUM" : "MOXBOTS_QA_WEBKIT"] } : {}) });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(`${engine}: ${error}`));
  await page.goto("http://127.0.0.1:5277/dev-docs/composer-status-20261027/preview.html", { waitUntil: "networkidle" });
  const bar = page.locator("[data-execution-status]");
  const region = () => bar.getByRole("region", { name: /执行详情|任务详情|目标详情|协作详情|Execution details|Task orchestration details/ });
  const execution = () => bar.getByRole("button", { name: "执行未确认", exact: true });
  await execution().waitFor();
  assert.equal(await region().count(), 0);
  assert.equal(await bar.count(), 1);
  const draft = page.getByRole("textbox", { name: "消息", exact: true });
  await draft.fill("保留输入中的草稿 @file.md");
  await execution().click();
  assert(await draft.evaluate(el => el === document.activeElement));
  assert.equal(await draft.inputValue(), "保留输入中的草稿 @file.md");
  await bar.getByText(/不会自动续跑/).waitFor();
  await bar.getByRole("button", { name: "待验收 1", exact: true }).click();
  assert.equal(await region().count(), 1);
  assert.equal(await bar.getByText(/不会自动续跑/).count(), 0);
  await bar.getByText("完成交互设计", { exact: true }).waitFor();
  const review = bar.getByRole("button", { name: "待验收 1", exact: true });
  await review.focus();
  await page.keyboard.press("Escape");
  assert.equal(await region().count(), 0);
  assert(await review.evaluate(el => el === document.activeElement));
  await page.keyboard.press("Enter");
  assert.equal(await region().count(), 1);
  await page.getByRole("button", { name: "切换会话", exact: true }).click();
  await execution().waitFor();
  assert.equal(await region().count(), 0);
  results.push({ engine, case: "mutual disclosure, direct review, draft/focus retained, Enter/Escape, session switch", passed: true });
  for (const width of [320, 390, 768, 1440]) {
   await page.setViewportSize({ width, height: 900 });
   for (const theme of ["dark", "light"]) {
    if (theme === "light") await page.getByRole("button", { name: "切换明暗", exact: true }).click();
    const geometry = await bar.evaluate(el => ({ height: el.getBoundingClientRect().height, border: getComputedStyle(el).borderTopWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth }));
    assert(geometry.height <= 40, JSON.stringify({ engine, width, theme, geometry }));
    assert.equal(geometry.border, "0px");
    assert.equal(geometry.pageOverflow, false);
    const rect = await review.boundingBox();
    assert(rect.x >= 0 && rect.x + rect.width <= width);
    await execution().focus();
    await page.keyboard.press("Enter");
    assert.equal(await region().count(), 1);
    await page.keyboard.press("Escape");
    await review.focus();
    await page.keyboard.press("Enter");
    assert.equal(await region().count(), 1);
    assert((await region().boundingBox()).height <= 281);
    await page.keyboard.press("Escape");
    await draft.fill("");
    await page.screenshot({ path: new URL(`${engine}-${width}-${theme}.png`, output).pathname });
    results.push({ engine, case: "compact, responsive, visible review, keyboard reachability", width, theme, ...geometry, passed: true });
   }
   await page.getByRole("button", { name: "切换明暗", exact: true }).click();
  }
  for (const [mode, label] of [["running", "运行中"], ["rework", "返工中"], ["paused", "已暂停"], ["incomplete", "未完成"], ["completed", "已完成"], ["recovery", "等待模型恢复"], ["long", "运行中"], ["unknown", "状态待同步"]]) {
   await page.getByRole("combobox", { name: "执行场景", exact: true }).selectOption(mode);
   const trigger = bar.getByRole("button", { name: label, exact: true });
   await trigger.waitFor();
   await trigger.focus();
   await page.keyboard.press("Enter");
   assert.equal(await region().count(), 1);
   if (mode === "long") {
    assert((await region().innerText()).length > 800);
    assert((await region().boundingBox()).height <= 281);
   }
   if (mode === "unknown") assert.equal(await bar.getByText("已完成", { exact: true }).count(), 0);
   await page.keyboard.press("Escape");
   results.push({ engine, case: `execution state ${mode}`, passed: true });
  }
  await page.getByRole("combobox", { name: "执行场景", exact: true }).selectOption("unconfirmed");
  await execution().waitFor();
  await page.getByRole("button", { name: "目标模式", exact: true }).click();
  await bar.getByRole("button", { name: /目标执行中/ }).click();
  await review.click();
  assert.equal(await region().count(), 1);
  await bar.getByRole("button", { name: "暂停", exact: true }).click();
  await bar.getByRole("button", { name: "继续", exact: true }).waitFor();
  await bar.getByRole("button", { name: "继续", exact: true }).click();
  assert.match(await page.locator("[data-receipt]").innerText(), /2 次/);
  results.push({ engine, case: "goal coexistence and single pause/resume callbacks", passed: true });
  await page.getByRole("button", { name: "目标模式", exact: true }).click();
  await page.getByRole("button", { name: "切换会话", exact: true }).click();
  await page.getByRole("combobox", { name: "执行场景", exact: true }).selectOption("history");
  const taskSummary = bar.getByRole("button", { name: /任务 0\/3/ });
  await taskSummary.waitFor();
  await taskSummary.focus();
  await page.keyboard.press("Enter");
  const history = bar.getByRole("button", { name: "查看全部执行记录", exact: true });
  await history.focus();
  await page.keyboard.press("Enter");
  const historyRegion = bar.getByRole("region", { name: "协作详情", exact: true });
  await historyRegion.waitFor();
  assert(await historyRegion.evaluate(el => el === document.activeElement));
  await page.keyboard.press("Escape");
  assert.equal(await region().count(), 0);
  assert(await taskSummary.evaluate(el => el === document.activeElement));
  results.push({ engine, case: "history navigation keeps focus; Escape returns to stable summary", passed: true });
  await page.getByRole("combobox", { name: "执行场景", exact: true }).selectOption("unconfirmed");
  await execution().waitFor();
  await page.getByRole("button", { name: "切换语言", exact: true }).click();
  await bar.getByRole("button", { name: "Execution unconfirmed", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  results.push({ engine, case: "English labels", passed: true });
  await page.getByRole("combobox", { name: "执行场景", exact: true }).selectOption("empty");
  await bar.waitFor({ state: "detached" });
  results.push({ engine, case: "empty state hides bar", passed: true });
 } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(new URL("results.json", output), JSON.stringify({ passed: true, results, errors }, null, 2));
console.log(JSON.stringify({ passed: true, cases: results.length, engines: 2, errors }));
