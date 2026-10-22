// Credential-free rendered acceptance of the actual SettingsPage.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, 'evidence/six-features');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM ?? '/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = 'http://127.0.0.1:8924/model-settings-qa';
const checks = [];
const summary = page.locator('summary').filter({ hasText: '故障接管' });
const details = summary.locator('..');
const auto = page.getByRole('switch', { name: '启用自动选模型' });
const mode = page.getByRole('button', { name: '故障接管模式', exact: true });
const cross = page.getByRole('checkbox', { name: '允许跨档选择备用（默认关闭）' });
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('model-settings-qa') ?? '{}'));
const chooseMode = async name => { await mode.click(); await page.getByRole('button', { name, exact: true }).click(); };
const open = async () => { if (await details.getAttribute('open') === null) await summary.click(); };

try {
  await page.goto(base);
  assert.equal(await page.getByRole('button', { name: '模型策略', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '备用模型', exact: true }).count(), 0);
  await page.getByRole('button', { name: '模型策略', exact: true }).click();
  await page.getByRole('group', { name: '强力', exact: true }).waitFor();
  assert.equal(await details.getAttribute('open'), null);
  assert.equal(await mode.isVisible(), false);
  await summary.focus(); await summary.press('Enter');
  assert.match(await mode.innerText(), /跟随自动选模/);
  assert.equal(await cross.isChecked(), false);
  await page.getByRole('button', { name: '备用供应商与模型', exact: true }).click();
  await page.getByRole('searchbox').fill('qa-balanced');
  await page.getByRole('searchbox').press('ArrowDown');
  await page.keyboard.press('Enter');
  await chooseMode('使用指定备用');
  await summary.getByText(/使用指定备用.*验收模型服务.*验收 balanced/).waitFor();
  await cross.check();
  await chooseMode('不自动切换模型');
  assert.equal(await cross.isDisabled(), true);
  assert.equal(await cross.isChecked(), true);
  assert.equal((await stored()).modelFailover.backup.modelId, 'qa-balanced');
  await chooseMode('跟随自动选模');
  assert.equal(await cross.isDisabled(), false);
  await cross.uncheck();
  await auto.click();
  await page.reload();
  await page.getByRole('button', { name: '模型策略', exact: true }).click();
  await open();
  assert.equal(await auto.getAttribute('aria-checked'), 'false');
  assert.match(await mode.innerText(), /跟随自动选模/);
  assert.equal(await cross.isChecked(), false);
  assert.equal((await stored()).modelFailover.backup.modelId, 'qa-balanced');
  checks.push('single entry; collapsed advanced controls; keyboard open/model choice; three modes; explicit cross-tier opt-in; mode/value independence; reload persistence');

  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('model-settings-qa'));
    value.autoRouting = { enabled: false, classifier: { providerId: 'deleted', model: 'missing' }, tierOverrides: { 'qa-provider/qa-fast': 'strong' }, tierOrder: { fast: ['qa-provider/qa-fast'] } };
    localStorage.setItem('model-settings-qa', JSON.stringify(value));
  });
  await page.goto(`${base}?section=model-policy`);
  await page.getByRole('button', { name: '恢复自动挑选判断模型', exact: true }).click();
  assert.equal((await stored()).autoRouting.classifier, undefined);
  await page.getByRole('button', { name: '恢复自动分档', exact: true }).click();
  assert.equal((await stored()).autoRouting.tierOverrides, undefined);
  assert.ok((await stored()).autoRouting.tierOrder);
  await page.getByRole('button', { name: '恢复默认排序', exact: true }).click();
  assert.equal((await stored()).autoRouting.tierOrder, undefined);
  assert.equal((await stored()).autoRouting.enabled, false);
  assert.equal((await stored()).modelFailover.backup.modelId, 'qa-balanced');
  checks.push('invalid classifier recovery and independent tier/order resets preserve unrelated settings');

  await page.route('**/api/admin/route/tiers', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"synthetic-offline"}' }));
  await page.reload();
  await page.getByText('读取模型档位失败。', { exact: true }).waitFor();
  await open();
  assert.equal(await mode.isVisible(), true);
  await page.unroute('**/api/admin/route/tiers');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('group', { name: '强力', exact: true }).waitFor();
  checks.push('catalog error is visible; failover remains usable; Retry restores tiers');

  const before = (await stored()).modelFailover;
  await page.goto(`${base}?section=model-policy&fail-save=1`);
  await open(); await chooseMode('使用指定备用');
  await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
  assert.deepEqual((await stored()).modelFailover, before);
  assert.match(await mode.innerText(), /跟随自动选模/);
  checks.push('failed mode save retains original persisted value and visible error');

  await page.goto(`${base}?section=model-policy`);
  await open(); await chooseMode('使用指定备用');
  await page.goto(`${base}?section=model-policy&missing-key=1`);
  await summary.getByText(/指定备用不可用.*缺少 API Key/).waitFor();
  await open(); await page.getByRole('button', { name: '前往模型供应商修复' }).click();
  await page.getByRole('heading', { name: '模型供应商', exact: true }).waitFor();
  checks.push('invalid configured backup warns in collapsed summary and links to provider repair');

  for (const section of ['model-policy', 'auto-routing', 'model-failover']) {
    await page.goto(`${base}?section=${section}`);
    await page.getByRole('heading', { name: '模型策略', exact: true }).waitFor();
  }
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}?section=model-policy`);
    await page.getByRole('group', { name: '强力', exact: true }).waitFor();
    const tiers = await page.getByRole('region', { name: '自动选模型' }).getByRole('group').evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width })));
    assert.ok(tiers.every(tier => tier.width > 200));
    assert.equal(tiers[0].x === tiers[1].x, width < 1024);
    for (const state of ['collapsed', 'expanded']) {
      if (state === 'expanded') { await open(); await mode.scrollIntoViewIfNeeded(); }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${state} overflow at ${width}`);
      await page.screenshot({ path: resolve(output, `policy-${state}-${width}.png`), fullPage: true });
    }
    checks.push(`${width}x900 collapsed/expanded: readable tier layout, no horizontal page overflow`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}?lang=en-US&section=model-policy`);
  await page.locator('summary').filter({ hasText: 'Failure recovery' }).click();
  await page.getByRole('button', { name: 'Failure recovery mode', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Model policy', exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  checks.push('English page and all three navigation intents resolve correctly; no page errors');
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ environment: base, role: 'synthetic local configuration', revision: 'working candidate for MOXBOTS-MODEL-SETTINGS-20261022; see acceptance.md commit', transport: 'actual SettingsPage, synthetic localStorage/config/API; no real provider/native runtime', checks, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  throw error;
} finally { await browser.close(); }
