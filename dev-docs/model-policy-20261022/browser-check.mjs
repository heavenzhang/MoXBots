// Primary-owner recheck of the real component against synthetic persistence.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const t = JSON.parse(await readFile(resolve(root, 'src/renderer/i18n/locales/en-US/settings.json'), 'utf8')).autoRouting;
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM ?? '/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
const read = () => page.evaluate(() => window.__modelPolicyQa.read());
const rows = () => page.getByRole('listitem');
const confirm = () => page.getByRole('dialog').getByRole('button', { name: t.confirm.action, exact: true });
try {
  await page.goto('http://127.0.0.1:8931/model-policy-qa?lang=en-US');
  await rows().first().waitFor();
  assert.equal(await rows().count(), 23);
  await rows().first().getByRole('button', { name: t.pause, exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.locator(':focus').innerText(), /Cancel/);
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal((await read()).pool, undefined);
  checks.push('Cancel Enter leaves candidate configuration unchanged');

  await rows().first().getByRole('button', { name: t.remove, exact: true }).click();
  await confirm().click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__modelPolicyQa.read().pool !== undefined);
  assert.equal((await read()).pool['qa-provider-a/qa-fast-1'], undefined);
  await page.reload();
  await rows().first().waitFor();
  assert.equal(await rows().count(), 22);
  checks.push('Remove creates explicit membership and stays removed after reload');

  await page.getByRole('button', { name: t.addModels, exact: true }).click();
  const addSearch = page.getByPlaceholder(t.searchAdd);
  await addSearch.fill('qa-fast-1');
  await page.getByRole('checkbox', { name: /qa-fast-1/ }).check();
  await page.getByRole('button', { name: /Add 1 selected/ }).click();
  await page.waitForFunction(() => window.__modelPolicyQa.read().pool?.['qa-provider-a/qa-fast-1']?.enabled === true);
  assert.equal(await rows().count(), 23);
  checks.push('Search and re-add excluded directory model with persisted membership');

  const before = JSON.stringify(await read());
  await page.evaluate(() => window.__modelPolicyQa.failSave(true));
  await rows().first().getByRole('button', { name: t.pause, exact: true }).click();
  await confirm().click();
  await page.getByRole('alert').filter({ hasText: t.saveFailed }).waitFor();
  assert.equal(JSON.stringify(await read()), before);
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.evaluate(() => window.__modelPolicyQa.failSave(false));
  await confirm().click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  checks.push('Failed save preserves data and confirmation; explicit retry succeeds');
  await page.screenshot({ path: resolve(import.meta.dirname, 'evidence/primary-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(import.meta.dirname, 'evidence/primary-390.png'), fullPage: true });
  checks.push('390px critical maintenance layout has no horizontal overflow');
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(import.meta.dirname, 'evidence/primary-browser-results.json'), JSON.stringify({ checks, errors, scope: 'actual component; synthetic browser persistence; no native or real Provider calls' }, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ checks: checks.length, errors }));
