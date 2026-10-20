// Isolated synthetic QA only. No account credentials, Host writes or model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.MOBILE_QA_ORIGIN ?? 'http://localhost:8091';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.MOBILE_QA_OUTPUT ?? 'output/mobile-session-history';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [];
async function scenario(label, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '选择 QA 演示场景' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: /打开会话/ }).first().click();
  return { page, context, errors };
}
try {
  {
    const { page, context, errors } = await scenario('会话读取失败重试');
    await page.getByText('会话暂时无法打开', { exact: true }).waitFor();
    assert.equal(await page.getByText('新建远程会话', { exact: true }).count(), 0);
    const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
    await input.fill('未发送的原会话草稿');
    assert.ok(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled());
    await page.getByRole('button', { name: '重试读取会话', exact: true }).click();
    await page.getByText('会话暂时无法打开', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), '未发送的原会话草稿');
    assert.equal(await page.getByText('设备返回的会话数据暂时无法读取。可重试读取；草稿会保留。', { exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: '发送消息', exact: true }).isEnabled());
    await page.screenshot({ path: path.join(output, 'open-retry-draft-retained.png') });
    await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /打开会话/ }).count(), 1, 'retry must not create another session');
    await page.getByRole('button', { name: /打开会话/ }).first().click();
    await page.waitForTimeout(400);
    assert.equal(await input.inputValue(), '未发送的原会话草稿');
    assert.equal(await page.getByLabel('聊天消息', { exact: true }).getByText('未发送的原会话草稿', { exact: true }).count(), 0, 'draft must not be sent by retry');
    // Explicit send in the synthetic bridge must continue the original session.
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.getByLabel('聊天消息', { exact: true }).getByText('未发送的原会话草稿', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /打开会话/ }).count(), 1);
    assert.deepEqual(errors, []);
    results.push({ scenario: 'failed-open-retry', noNewSessionFallback: true, sendBlockedUntilRead: true, draftRetainedAcrossRetryAndReopen: true, noAutoSend: true });
    await context.close();
  }
  for (const width of [320, 390, 768]) {
    const { page, context, errors } = await scenario('长会话历史翻页', width);
    const transcript = page.getByLabel('聊天消息', { exact: true });
    assert.equal(await page.getByRole('heading', { name: /历史记录/ }).count(), 30);
    await transcript.hover(); await page.mouse.wheel(0, -10000); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '加载更早记录', exact: true }).click();
    await page.getByText('更早记录读取失败，可以重试；当前内容和草稿已保留。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: /历史记录/ }).count(), 30);
    const anchor = page.getByRole('heading', { name: '历史记录 61', exact: true });
    const anchorBeforeY = (await anchor.boundingBox()).y;
    const beforeMetrics = await transcript.evaluate(el => ({ offset: el.scrollTop, contentHeight: el.scrollHeight, viewportY: el.getBoundingClientRect().y }));
    await page.screenshot({ path: path.join(output, `history-before-prepend-${width}.png`) });
    await page.getByRole('button', { name: '加载更早记录', exact: true }).click();
    await page.getByRole('heading', { name: '历史记录 31', exact: true }).waitFor({ state: 'attached' });
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('heading', { name: /历史记录/ }).count(), 60);
    const anchorY = (await anchor.boundingBox()).y;
    const afterMetrics = await transcript.evaluate(el => ({ offset: el.scrollTop, contentHeight: el.scrollHeight, viewportY: el.getBoundingClientRect().y }));
    await page.screenshot({ path: path.join(output, `history-after-prepend-${width}.png`) });
    assert.ok(Math.abs(anchorY - anchorBeforeY) < 5, `prepend must retain the same reading anchor: ${anchorBeforeY} -> ${anchorY}`);
    await page.waitForTimeout(1800);
    assert.equal(await page.getByRole('heading', { name: /历史记录/ }).count(), 60, 'latest poll must retain older page');
    assert.ok(Math.abs((await anchor.boundingBox()).y - anchorY) < 5, 'poll must preserve the loaded history reading position');
    await transcript.hover(); await page.mouse.wheel(0, -10000); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '加载更早记录', exact: true }).click();
    await page.getByRole('heading', { name: '历史记录 1', exact: true }).waitFor({ state: 'attached' });
    assert.equal(await page.getByRole('heading', { name: /历史记录/ }).count(), 90);
    assert.equal(await page.getByRole('button', { name: '加载更早记录', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `history-${width}.png`) });
    await page.getByRole('button', { name: '回到最新消息', exact: true }).click();
    await page.waitForFunction(() => { const el = document.querySelector('[aria-label="聊天消息"]'); return el && el.scrollHeight - el.clientHeight - el.scrollTop < 5; }, undefined, { timeout: 4000 });
    assert.deepEqual(errors, []);
    results.push({ scenario: 'history', width, pages: 3, messages: 90, failureRetryRetainsContent: true, beforeMetrics, afterMetrics, prependAnchorBeforeY: anchorBeforeY, prependAnchorY: anchorY, pollingRetainsHistory: true, noOverflowOrPageError: true });
    await context.close();
  }
  {
    const { page, context, errors } = await scenario('历史刷新故障恢复');
    const notice = page.getByText('设备返回的会话数据暂时无法读取。可重试读取；草稿会保留。', { exact: true });
    await notice.waitFor({ timeout: 6000 });
    await notice.waitFor({ state: 'hidden', timeout: 6000 });
    assert.deepEqual(errors, []);
    results.push({ scenario: 'poll-recovery', sameRevisionRecoveryClearsOnlyReadFailure: true });
    await context.close();
  }
  await fs.writeFile(path.join(output, 'core-browser-results.json'), JSON.stringify({ syntheticOnly: true, results }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
