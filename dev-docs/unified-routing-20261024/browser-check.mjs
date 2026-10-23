import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve(import.meta.dirname, 'evidence');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const legacy = { enabled: true, mode: 'specified', allowCrossTier: true, backup: { providerId: 'retired', modelId: 'legacy-backup' } };
const candidates = ['fast', 'balanced', 'strong', 'strong-2'].map((name, i) => ({ providerId: 'qa-provider', model: `qa-${name}`, modelName: `验收 ${name}`, providerName: '验收模型服务', tier: ['fast', 'balanced', 'strong', 'strong'][i], source: 'catalog', available: true }));
await page.addInitScript(({ legacy }) => {
  if (!localStorage.getItem('unified-routing-qa')) localStorage.setItem('unified-routing-qa', JSON.stringify({ modelFailover: legacy }));
}, { legacy });
await page.route('**/api/admin/route/tiers', async route => {
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('unified-routing-qa') ?? '{}').autoRouting ?? {});
  const models = candidates.map(c => { const key = `${c.providerId}/${c.model}`; const inPool = settings.pool === undefined || Object.hasOwn(settings.pool, key); return { ...c, tier: settings.tierOverrides?.[key] ?? c.tier, inPool, enabled: inPool && settings.pool?.[key]?.enabled !== false }; });
  const tiers = Object.fromEntries(['fast', 'balanced', 'strong'].map(t => [t, models.filter(m => m.tier === t && m.enabled).sort((a, b) => {
    const order = settings.tierOrder?.[t] ?? []; const pos = m => { const i = order.indexOf(`${m.providerId}/${m.model}`); return i < 0 ? 999 : i; }; return pos(a) - pos(b);
  })]));
  await route.fulfill({ json: { success: true, data: { enabled: settings.enabled !== false, tiers, models, classifier: { providerId: 'qa-provider', model: 'qa-fast', chosenBy: 'auto' } } } });
});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const base = 'http://127.0.0.1:8937/unified-routing-qa?section=model-policy';
try {
  await page.goto(base);
  const card = page.getByRole('region', { name: '自动选模型', exact: true });
  await card.getByText('qa-strong-2', { exact: false }).first().waitFor();
  await page.getByText(/同档候选/).first().waitFor();
  assert.equal(await page.locator('#model-failover-settings').count(), 0);
  assert.equal(await page.getByText(/使用指定备用|允许跨档选择备用|不自动切换模型/).count(), 0);
  const toggle = page.getByRole('switch', { name: '启用自动选模型' });
  assert.equal(await toggle.getAttribute('aria-checked'), 'true');
  await toggle.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('unified-routing-qa')).autoRouting.enabled === false);
  await page.reload();
  assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('unified-routing-qa')).modelFailover), legacy);
  await toggle.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('unified-routing-qa')).autoRouting.enabled === true);
  const checks = ['legacy backup/cross-tier/off controls absent', 'automatic selection toggles and survives reload', 'unknown legacy config preserved without becoming controls'];
  for (const [w, h] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.screenshot({ path: resolve(out, `model-policy-${w}.png`), fullPage: true });
    assert(await card.isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push(`visible settings card without horizontal page overflow at ${w}x${h}`);
  }
  await page.goto(`${base}&fail-save=1`);
  await page.getByRole('switch', { name: '启用自动选模型' }).click();
  await page.getByRole('alert').filter({ hasText: /保存/ }).waitFor();
  assert.equal(await page.getByRole('switch', { name: '启用自动选模型' }).getAttribute('aria-checked'), 'true');
  checks.push('failed save retains prior visible state with error feedback');
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, 'browser-result.json'), JSON.stringify({ passed: true, environment: base, transport: 'real SettingsPage, synthetic configuration and route tiers; no native/provider/production acceptance', checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors }));
} finally { await browser.close(); }
