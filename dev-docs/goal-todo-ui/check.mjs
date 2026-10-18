import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const output = process.env.GOAL_TODO_EVIDENCE || "/tmp/goal-todo-ui-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.GOAL_TODO_CHROMIUM
    ? { executablePath: process.env.GOAL_TODO_CHROMIUM }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const checks = [];
const pass = (name) => checks.push(name);
try {
  await page.goto(`${process.env.GOAL_TODO_BASE_URL || "http://127.0.0.1:5188"}/dev-docs/goal-todo-ui/preview.html`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  const expand = () =>
    page.getByRole("button", { name: "展开 Agent 状态面板" });
  await expand().waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${output}/desktop-collapsed.png` });
  await expand().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "已完成 5 项" }).waitFor();
  assert.equal(
    await page
      .getByText("数据库迁移：新增 finance_principal_type/id 列", {
        exact: true,
      })
      .count(),
    0,
  );
  assert.match(
    await page.getByRole("listitem").first().innerText(),
    /正在校验/,
  );
  await page.screenshot({ path: `${output}/desktop-expanded.png` });
  pass(
    "collapsed summary, Enter expansion, active first and completion hidden",
  );
  await page.getByRole("button", { name: "已完成 5 项" }).click();
  await page
    .getByText("数据库迁移：新增 finance_principal_type/id 列", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "已完成 5 项" }).focus();
  await page.keyboard.press("Escape");
  assert.equal(await expand().getAttribute("aria-expanded"), "false");
  assert(await expand().evaluate((el) => el === document.activeElement));
  pass("completion disclosure and Escape restores trigger focus");
  await page.getByRole("button", { name: "编辑目标", exact: true }).click();
  assert.match(await page.getByRole("status").innerText(), /编辑目标：1/);
  await page.getByRole("button", { name: "取消目标", exact: true }).click();
  assert.match(await page.getByRole("status").innerText(), /取消目标：1/);
  pass("goal edit and cancel callbacks");
  await page.getByLabel("消息输入").fill("未发送的草稿");
  await page.getByRole("button", { name: "暂停", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.match(await page.getByRole("status").innerText(), /暂停目标：1/);
  assert.equal(await page.getByRole("button", { name: "暂停", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "取消目标", exact: true }).count(), 1);
  assert.equal(await page.getByLabel("消息输入").inputValue(), "未发送的草稿");
  await page.screenshot({ path: `${output}/goal-paused.png` });
  pass("keyboard pause keeps cancel and unsent draft, switches to resume");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  assert.match(await page.getByRole("status").innerText(), /继续目标：1/);
  assert.equal(await page.getByRole("button", { name: "暂停", exact: true }).count(), 1);
  pass("paused resume callback restores pause");
  for (const state of ["complete", "blocked", "canceled"]) {
    await page.getByRole("combobox", { name: "目标状态" }).selectOption(state);
    await page.getByRole("button", { name: "关闭目标状态" }).click();
    assert.equal(
      await page.getByRole("button", { name: "取消目标", exact: true }).count(),
      0,
    );
  }
  pass("terminal states retain summary and dismiss callback");
  await page.getByRole("button", { name: "长目标", exact: true }).click();
  const objective = page.locator("details summary");
  await objective.focus();
  await page.keyboard.press("Enter");
  assert(await page.locator("details").evaluate((el) => el.open));
  pass("terminal long objective expands by keyboard");
  await objective.press("Enter");
  await page.getByRole("button", { name: "长列表", exact: true }).click();
  await expand().click();
  await page.getByRole("button", { name: "切换明暗", exact: true }).click();
  await page.screenshot({ path: `${output}/desktop-dark.png` });
  for (const [width, height] of [
    [768, 900],
    [390, 844],
    [320, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${output}/narrow-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const region = page.locator('[id][class*="overscroll-contain"]');
    assert(await region.evaluate((el) => el.scrollHeight > el.clientHeight));
    await region.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    assert(await region.evaluate((el) => el.scrollTop > 0));
    assert.equal(
      await page.getByLabel("消息输入").inputValue(),
      "未发送的草稿",
    );
  }
  pass(
    "768/390/320 widths, bounded shared scrolling, long identifiers, dark theme, draft retained",
  );

  await page.getByRole('combobox', {name:'目标状态'}).selectOption('active');
  await objective.focus(); await objective.press('Enter');
  assert(await page.locator('details').evaluate(el=>el.open));
  assert(await objective.evaluate(el=>el.clientHeight <= 129 && el.scrollHeight > el.clientHeight));
  await objective.press('End');
  await page.waitForFunction(()=>document.querySelector('summary').scrollTop > 0);
  const progress = page.getByRole('region', {name:'任务进度详情'});
  await progress.evaluate(el=>{el.scrollTop=0});
  await progress.focus(); await progress.press('End');
  await page.waitForFunction(()=>document.querySelector('[role="region"]').scrollTop > 0);
  await page.getByLabel('消息输入').scrollIntoViewIfNeeded();
  const composerBox=await page.getByLabel('消息输入').boundingBox();
  assert(composerBox && composerBox.y >= 0 && composerBox.y + composerBox.height <= 721);
  await page.screenshot({path:`${output}/narrow-320-long-objective.png`});
  await progress.focus(); await progress.press('Escape');
  assert.equal(await expand().getAttribute('aria-expanded'),'false');
  pass('320x720 simultaneous long goal/list: bounded objective keyboard scrolling, progress keyboard scrolling, Composer reachable, Escape focus');
  await page.getByRole('button', { name: '暂停', exact: true }).scrollIntoViewIfNeeded();
  const pauseButton = page.getByRole('button', { name: '暂停', exact: true });
  const cancelButton = page.getByRole('button', { name: '取消目标', exact: true });
  for (const button of [pauseButton, cancelButton]) {
    const box = await button.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 320 && box.height >= 32);
  }
  await pauseButton.click();
  await page.getByRole('button', { name: '继续', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/narrow-320-paused.png` });
  pass('320px pause/cancel hit areas and pause interaction');
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        status: "passed",
        checks,
        pageErrors: errors,
        scope:
          "actual renderer components / synthetic Tab data / no server or native acceptance",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ output, checks }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(
    `${output}/failure.txt`,
    `${error.stack}\n${errors.join("\n")}`,
  );
  throw error;
} finally {
  await browser.close();
}
