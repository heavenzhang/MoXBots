// Run the app with EXPO_PUBLIC_MOBILE_QA=1; uses only synthetic local data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.MOBILE_QA_ORIGIN ?? 'http://localhost:8091';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.MOBILE_QA_OUTPUT ?? 'output/mobile-message-layout';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [];
try {
  for (const width of [320, 390, 428, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) { external.push(url.origin); return route.abort(); }
      return route.continue();
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '选择 QA 演示场景' }).click();
    await page.getByRole('button', { name: '富文本与长内容', exact: true }).click();
    await page.getByRole('button', { name: /打开会话/ }).first().click();
    await page.getByRole('heading', { name: '移动端会话验收', exact: true }).waitFor();
    const transcript = page.getByLabel('聊天消息', { exact: true });
    // Actual wheel input arms the same reading-position behavior as native drag.
    await transcript.hover();
    await page.mouse.wheel(0, -5000);
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '回到最新消息', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `markdown-top-${width}.png`) });
    assert.equal(await page.getByRole('heading', { name: '执行步骤' }).count(), 1);
    const bold = page.getByText('重点内容', { exact: true });
    assert.ok(Number(await bold.evaluate(el => getComputedStyle(el).fontWeight)) >= 600);
    assert.equal(external.length, 0, 'Markdown images must not fetch before explicit tap');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const label of ['可横向滚动的代码块', '可横向滚动的表格']) {
      const el = page.getByLabel(label).first();
      const metrics = await el.evaluate(el => ({ width: el.clientWidth, full: el.scrollWidth }));
      assert.ok(metrics.full > metrics.width, `${label} must overflow locally at ${width}`);
      await el.evaluate(el => { el.scrollLeft = 120; });
      assert.ok(await el.evaluate(el => el.scrollLeft) > 0);
    }
    // Loading an image changes the transcript height while the reader is above bottom.
    const load = page.getByRole('button', { name: '加载图片：受控图片占位', exact: true });
    await load.scrollIntoViewIfNeeded();
    await transcript.hover(); await page.mouse.wheel(0, -100); await page.waitForTimeout(150);
    const before = await transcript.evaluate(el => el.scrollTop);
    await load.click();
    await page.getByText('图片加载失败，可打开原链接查看。', { exact: true }).waitFor();
    await page.waitForTimeout(1800); // includes one normal snapshot poll
    const after = await transcript.evaluate(el => el.scrollTop);
    assert.ok(Math.abs(after - before) < 5, `image layout must not jump to bottom (${before} -> ${after})`);
    assert.ok(external.length >= 1 && external.every(origin => origin === 'https://example.invalid'), JSON.stringify(external));
    await page.screenshot({ path: path.join(output, `markdown-reading-${width}.png`) });
    await page.getByRole('button', { name: '回到最新消息', exact: true }).click();
    await page.waitForTimeout(350);
    assert.ok(await transcript.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop) < 5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const toolOutput = page.getByLabel('Bash 的只读输出', { exact: true });
    assert.equal(await toolOutput.count(), 0, 'tool details must start collapsed');
    await page.getByRole('button', { name: 'Bash，完成，展开输出', exact: true }).click();
    await toolOutput.waitFor();
    assert.ok(await page.getByLabel('Bash 的横向输出', { exact: true }).evaluate(el => el.scrollWidth > el.clientWidth));
    assert.ok(await toolOutput.evaluate(el => el.scrollHeight > el.clientHeight), 'long outputs need their own vertical reading area');
    await toolOutput.evaluate(el => { el.scrollTop = 100; });
    assert.ok(await toolOutput.evaluate(el => el.scrollTop) > 0);
    if (width === 390) await page.screenshot({ path: path.join(output, 'tool-output-expanded-390.png') });
    assert.ok((await toolOutput.textContent()).includes('CONTROLLED_TOOL_OUTPUT\n  second line'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Bash，完成，收起输出', exact: true }).click();
    assert.equal(await toolOutput.count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, noPageError: true, noDocumentOverflow: true, codeAndTableLocalScroll: true, noAutomaticImageRequest: true, readingPositionBefore: before, readingPositionAfter: after, returnToBottom: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '选择 QA 演示场景' }).click();
    await page.getByRole('button', { name: '切换 Bot 错误隔离', exact: true }).click();
    await page.getByRole('button', { name: /打开会话/ }).first().click();
    const oldError = page.getByText('设备返回的会话数据暂时无法读取。可重试读取；草稿会保留。', { exact: true });
    await oldError.waitFor();
    await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
    await oldError.waitFor();
    await page.getByRole('button', { name: '第二个演示 Bot，在线', exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(await oldError.count(), 0, 'a failed target notice must not contaminate a newly selected healthy Bot');
    await page.getByRole('button', { name: /打开会话/ }).first().waitFor();
    await page.screenshot({ path: path.join(output, 'target-notice-isolated.png') });
    results.push({ test: 'target-error-notice-isolation', passed: true });
    await context.close();
  }
  await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ at: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
