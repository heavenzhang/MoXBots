// Real ProjectSpaceView with synthetic project/session observations only.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { webkit } from 'playwright';
const repo = resolve(import.meta.dirname, '..');
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-project-workbench-'));
const server = await createServer({ configFile: resolve(repo, 'vite.config.ts'), root: resolve(repo, 'src/renderer'),
  optimizeDeps: { entries: ['__fixtures__/project-spaces-m2.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}__fixtures__/project-spaces-m2.html`);
  const project = page.locator('[data-project-space="product"]');
  await project.getByRole('region', { name: '当前工作', exact: true }).waitFor();
  assert.equal(await project.locator('[data-project-work-id]').count(), 2);
  assert.equal(await project.locator('details').getAttribute('open'), null);
  await page.screenshot({ path: resolve(output, 'overview-dark-1440.png') });
  await project.locator('[data-project-work-id="session:s1"]').click();
  await page.getByRole('heading', { name: '项目首页应该承接哪些工作', exact: true }).waitFor();
  await page.getByRole('button', { name: '返回项目', exact: true }).click();
  await project.getByRole('tab', { name: '成果', exact: true }).click();
  assert.equal(await project.locator('[data-project-work-id]').count(), 1);
  assert.equal(await project.locator('[data-project-work-id]').getAttribute('data-project-work-id'), 'session:s2');
  await project.locator('[data-project-work-id="session:s2"]').click();
  await page.getByRole('heading', { name: '梳理 Bot 与项目之间的关系', exact: true }).waitFor();
  await page.getByRole('button', { name: '返回项目', exact: true }).click();
  await page.getByRole('button', { name: '公司经营分析', exact: true }).click();
  const business = page.locator('[data-project-space="business"]');
  await business.getByRole('heading', { name: '公司经营分析', exact: true }).waitFor();
  assert.equal(await business.locator('[data-project-work-id]').count(), 0);
  assert.equal(await business.getByText('梳理 Bot 与项目之间的关系', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'MoXBots 产品迭代', exact: true }).click();
  await page.getByLabel('读取失败', { exact: true }).check();
  const work = project.getByRole('region', { name: '当前工作', exact: true });
  await work.getByRole('alert').waitFor();
  assert.equal(await work.locator('[data-project-work-id]').count(), 2);
  await work.getByRole('button', { name: '更新工作状态', exact: true }).click();
  assert.equal(await work.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: '切换深浅主题', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => undefined)));
  });
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(geometry.width <= geometry.viewport, JSON.stringify(geometry));
  await page.screenshot({ path: resolve(output, 'overview-light-390.png') });
  await project.getByRole('tab', { name: '概览', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await project.getByRole('tab', { name: '项目对话', exact: true }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await project.getByRole('tab', { name: '成果', exact: true }).getAttribute('aria-selected'), 'true');
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => undefined)));
  });
  await page.screenshot({ path: resolve(output, 'results-light-390.png') });
  assert.deepEqual(errors, []);
  const result = { status: 'PASS', browser: 'isolated WebKit', synthetic: true, geometry,
    checks: ['current work before conversation history', 'explicit completed Goal results only', 'original Session callbacks', 'same-Bot project isolation', 'read failure preserves rows and retry recovers', '390px no overflow', 'light/dark and keyboard tabs'], errors };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, output }));
} finally { await browser?.close(); await server.close(); }
