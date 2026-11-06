// Actual sidebar component, synthetic data and an isolated WebKit browser.
// Does not open the user's browser profile, installed app, or real Session store.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { webkit } from 'playwright';

const repo = resolve(import.meta.dirname, '..');
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-bot-nav-'));
const server = await createServer({
  configFile: resolve(repo, 'vite.config.ts'),
  root: resolve(repo, 'src/renderer'),
  optimizeDeps: { entries: ['__fixtures__/bot-navigation.html'] },
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
let browser;
const results = [];
try {
  await server.listen();
  browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}__fixtures__/bot-navigation.html`);
  const nav = page.locator('[data-bot-navigation="conversations"]');
  const rows = nav.locator('[data-conversation-id]');
  await rows.first().waitFor();
  assert.equal(await rows.count(), 12);
  assert.equal(await nav.getByText('正在读取会话…', { exact: true }).count(), 0);
  assert.equal(await nav.getByText('正在更新会话…', { exact: true }).count(), 0);
  results.push('passive workspaces settled despite unused global initial-loading flag');

  const filter = nav.getByRole('button', { name: '按 Bot 或项目筛选对话', exact: true });
  await filter.click();
  await page.getByRole('button', { name: 'Bot · Mino · 研究工作区', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Bot · 尚无会话的 Bot', exact: true }).count(), 0);
  await page.screenshot({ path: resolve(output, 'dark-filter.png') });
  await page.getByRole('button', { name: 'Bot · Mino · 研究工作区', exact: true }).click();
  assert.equal(await rows.count(), 1);
  await rows.first().click();
  assert.match(await page.locator('main [role="status"]').innerText(), /session-9 · workspace-reader/);
  results.push('same-name Bot filtering preserves exact Session and workspace identity');

  await page.getByLabel('读取失败', { exact: true }).check();
  await nav.getByRole('alert').waitFor();
  assert.match(await nav.getByRole('alert').innerText(), /已加载的会话仍可使用/);
  assert.equal(await rows.count(), 1);
  await filter.click();
  await page.getByRole('button', { name: 'Bot · Mino · 产品工作区', exact: true }).click();
  assert.equal(await nav.getByRole('alert').count(), 0);
  assert.equal(await rows.count(), 11);
  await filter.click();
  await page.getByRole('button', { name: 'Bot · Mino · 研究工作区', exact: true }).click();
  await nav.getByRole('button', { name: '重试', exact: true }).click();
  assert.equal(await nav.getByRole('alert').count(), 0);
  results.push('partial failure remains readable, is scoped to its Bot, and retry recovers');

  await page.getByLabel('加载中', { exact: true }).check();
  await nav.getByText('正在更新会话…', { exact: true }).waitFor();
  await page.getByLabel('空态', { exact: true }).check();
  await nav.getByText('正在读取会话…', { exact: true }).waitFor();
  await page.getByLabel('加载中', { exact: true }).uncheck();
  assert.equal(await nav.getByText('正在读取会话…', { exact: true }).count(), 0);
  await page.getByLabel('空态', { exact: true }).uncheck();
  results.push('first loading, cached refreshing, and empty completion are distinct');

  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => undefined)));
  });
  await page.screenshot({ path: resolve(output, 'light-390.png') });
  const geometry = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, sidebar: document.querySelector('aside').getBoundingClientRect().width }));
  assert.ok(geometry.document <= geometry.viewport, JSON.stringify(geometry));
  await filter.click();
  await page.keyboard.press('Escape');
  assert.equal(await filter.getAttribute('aria-expanded'), 'false');
  await filter.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bot · Mino · 产品工作区', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await rows.count(), 11);
  results.push('390px layout, light/dark appearance and Return/Escape interactions');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ status: 'PASS', browser: 'isolated WebKit', fixture: 'actual BotConversationNavigation / synthetic only', results, geometry, errors }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', output, checks: results }));
} finally {
  await browser?.close();
  await server.close();
}
