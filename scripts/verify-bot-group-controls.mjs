import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { webkit } from 'playwright';
const repo = resolve(import.meta.dirname, '..');
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-group-controls-'));
const server = await createServer({ configFile: resolve(repo, 'vite.config.ts'), root: resolve(repo, 'src/renderer'),
  optimizeDeps: { entries: ['__fixtures__/bot-group-controls.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen(); browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const errors = []; page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto(`${server.resolvedUrls.local[0]}__fixtures__/bot-group-controls.html`);
  const recipient = page.getByRole('button', { name: '发送给', exact: true });
  assert.match(await recipient.textContent(), /选择接收这条消息的 Bot/);
  await recipient.click(); await page.getByRole('button', { name: /小墨.*writer/ }).click();
  await page.getByRole('button', { name: '模拟成员版本变化' }).click();
  assert.match(await recipient.textContent(), /选择接收这条消息的 Bot/);
  await page.getByRole('status').filter({ hasText: '重新选择' }).waitFor();
  await page.getByRole('button', { name: '管理群成员' }).click();
  assert.equal(await page.getByLabel('群组名称', { exact: true }).evaluate(element => element === document.activeElement), true);
  const save = page.getByRole('button', { name: '保存群组', exact: true });
  await save.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: '关闭', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.screenshot({ path: resolve(output, 'members-dark-1280.png') });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '管理群成员' }).evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', { name: '切换深浅主题' }).click();
  await page.getByRole('button', { name: '模拟保存后响应丢失' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '管理群成员' }).click();
  await page.getByLabel('群组名称', { exact: true }).fill('保留这一份群组修改');
  await save.click();
  await page.getByRole('button', { name: '核对保存结果', exact: true }).waitFor();
  assert.equal(await page.getByLabel('群组名称', { exact: true }).isDisabled(), true);
  assert.equal(await save.isDisabled(), true);
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => undefined)));
  });
  assert.ok(await save.evaluate(element => Number(getComputedStyle(element).opacity) <= 0.65), 'disabled save must look disabled');
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, dialogWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth };
  });
  assert.ok(geometry.documentWidth <= geometry.viewport && geometry.dialogScrollWidth <= geometry.dialogWidth, JSON.stringify(geometry));
  await page.screenshot({ path: resolve(output, 'uncertain-light-390.png') });
  await page.getByRole('button', { name: '核对保存结果', exact: true }).click();
  await page.getByRole('status', { exact: true }).filter({ hasText: '群组配置已核对' }).waitFor();
  assert.equal(await page.getByTestId('calls').textContent(), '配置请求：1');
  await page.getByRole('button', { name: '模拟另一处修改' }).click();
  await page.getByRole('button', { name: '管理群成员' }).click();
  await page.getByLabel('群组名称', { exact: true }).fill('冲突后保留的草稿');
  await save.click(); await page.getByRole('button', { name: '读取最新配置', exact: true }).click();
  assert.equal(await page.getByLabel('群组名称', { exact: true }).inputValue(), '冲突后保留的草稿');
  assert.equal(await save.isDisabled(), true);
  await page.screenshot({ path: resolve(output, 'conflict-light-390.png') });
  await page.getByRole('button', { name: '保留我的修改，按最新版本继续', exact: true }).click();
  await save.click(); await page.getByRole('heading', { name: '冲突后保留的草稿', exact: true }).waitFor();
  assert.equal(await page.getByTestId('calls').textContent(), '配置请求：3');
  assert.deepEqual(errors, []);
  const result = { status: 'PASS', synthetic: true, browser: 'isolated WebKit', output, geometry,
    checks: ['explicit recipient/no reroute', 'same-name identities', 'keyboard focus loop and restoration', 'unknown save reconciliation without duplicate POST', 'conflict draft retention/explicit rebase', 'Sage light/dark', '390px no overflow'], errors };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser?.close(); await server.close(); }
