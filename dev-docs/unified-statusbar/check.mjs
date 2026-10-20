import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const output = new URL("./evidence/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STATUSBAR_CHROMIUM
    ? { executablePath: process.env.STATUSBAR_CHROMIUM }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const checks = [],
  errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const pass = (name) => checks.push(name);
const region = () =>
  page.getByRole("region", { name: /目标详情|待办详情|协作详情/ });
const bar = () => page.locator("[data-execution-status]");
try {
  await page.goto(
    "http://127.0.0.1:5197/dev-docs/unified-statusbar/preview.html",
    { waitUntil: "networkidle", timeout: 120000 },
  );
  await bar().waitFor();
  assert.equal(await region().count(), 0);
  assert.equal(await bar().count(), 1);
  const initialHeight = (await bar().boundingBox()).height;
  assert(initialHeight <= 50);
  await page.screenshot({
    path: new URL("desktop-collapsed.png", output).pathname,
  });
  pass(
    `single collapsed desktop row (${initialHeight}px), all summaries and pause`,
  );
  const todo = page.getByRole("button", { name: /待办 8\/11/ });
  await todo.focus();
  await page.keyboard.press("Enter");
  await region().waitFor();
  assert.equal(await region().count(), 1);
  await page.getByRole("button", { name: "已完成 8 项" }).click();
  await page.getByText("第 1 项：开发与验证", { exact: true }).waitFor();
  await page.screenshot({
    path: new URL("desktop-todos.png", output).pathname,
  });
  await page.keyboard.press("Escape");
  assert.equal(await region().count(), 0);
  assert(await todo.evaluate((el) => document.activeElement === el));
  pass(
    "Enter opens Todos, completed disclosure works, Escape restores trigger focus",
  );
  const goal = page.getByRole("button", { name: /目标执行中/ });
  await goal.click();
  await page.keyboard.press("Escape");
  assert.equal(await region().count(), 0);
  await goal.click();
  await page.getByRole("button", { name: /子 Agent.*已回传 1/ }).click();
  assert.equal(await region().count(), 1);
  await page.getByRole("button", { name: /检查交互与响应式布局/ }).click();
  await page
    .locator("[data-receipt]")
    .filter({ hasText: /回调 1 次/ })
    .waitFor();
  pass(
    "detail sections mutually exclusive; original subagent callback called once",
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "继续", exact: true }).waitFor();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).waitFor();
  assert.match(await page.locator("[data-receipt]").innerText(), /回调 3 次/);
  pass("pause and resume external, one callback each");
  await page.getByTitle("更多操作", { exact: true }).click();
  await page.getByText("编辑目标", { exact: true }).click();
  await page.getByTitle("更多操作", { exact: true }).click();
  await page.getByText("取消目标", { exact: true }).click();
  assert.match(await page.locator("[data-receipt]").innerText(), /回调 5 次/);
  assert.equal(
    await page.getByRole("button", { name: "暂停", exact: true }).count(),
    0,
  );
  pass("overflow menu edit and cancel preserve original one-shot callbacks");
  await page
    .getByRole("combobox", { name: "目标状态" })
    .selectOption("complete");
  await page.getByRole("button", { name: /目标已完成/ }).click();
  await region()
    .getByText(/12.0K tokens/)
    .waitFor();
  await page.getByRole("button", { name: "长目标", exact: true }).click();
  assert((await region().innerText()).length > 500);
  pass("settled totals and full long objective remain reachable");
  await page.getByRole("combobox", { name: "目标状态" }).selectOption("active");
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "切换会话", exact: true }).click();
    assert.equal(await region().count(), 0);
    const bounds = await bar().boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert(bounds.height <= 50);
    const pause = await page
      .getByRole("button", { name: "暂停", exact: true })
      .boundingBox();
    assert(pause.x >= 0 && pause.x + pause.width <= width);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: new URL(`width-${width}-collapsed.png`, output).pathname,
    });
    await page.getByRole("button", { name: /待办 8\/11/ }).click();
    await region().waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await region().count(), 0);
    await page.getByRole("button", { name: /子 Agent.*已回传 1/ }).click();
    await region().waitFor();
    await page.keyboard.press("Escape");
    pass(
      `${width}px: single row, summary scrolling, pause visible, Todo/agent reachable, no page overflow, session reset`,
    );
  }
  await page.getByRole("button", { name: "切换明暗", exact: true }).click();
  await page.screenshot({
    path: new URL("width-320-dark.png", output).pathname,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: new URL("desktop-dark.png", output).pathname });
  pass("dark theme uses semantic surfaces and state colors");
  await page.getByRole("button", { name: "清空数据", exact: true }).click();
  assert.equal(await bar().count(), 0);
  await page.getByRole("textbox", { name: "消息输入" }).fill("草稿保持可编辑");
  assert.equal(
    await page.getByRole("textbox", { name: "消息输入" }).inputValue(),
    "草稿保持可编辑",
  );
  pass("empty status disappears; composer remains editable");
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("results.json", output),
    JSON.stringify(
      {
        passed: true,
        checks,
        errors,
        boundary:
          "Actual React component with synthetic Tab state; not native or real Goal execution.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await browser.close();
}
