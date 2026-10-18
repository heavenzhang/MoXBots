import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5198/model-picker-qa.html';
console.log('launch');
const browser = await chromium.launch({ headless: true, timeout: 60000, ...(process.env.MODEL_PICKER_QA_BROWSER ? { executablePath: process.env.MODEL_PICKER_QA_BROWSER } : {}) });
const report = { checks: [], failures: [], consoleErrors: [], pageErrors: [] };
const check = async (name, fn) => { try { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 }); console.log('loaded initial'); await fn(); report.checks.push(name); console.log(`PASS ${name}`); } catch (error) { report.failures.push(`${name}: ${error.message}`); console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`); } };
console.log('launched');
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(15000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
await page.goto(base, { waitUntil: 'domcontentloaded' });
const backup = page.getByRole('button', { name: '备用供应商与模型' });
const provider = page.getByRole('button', { name: '筛选供应商' });
const input = page.locator('input[type=search]');
const openBackup = async () => { await backup.click(); await input.waitFor({ state: 'visible' }); };
const matches = () => page.locator('[data-select-option]').filter({ hasText: '·' });

await check('桌面初始布局无横向溢出', async () => {
 const dimensions = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
 assert.equal(dimensions.sw, dimensions.iw);
 await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/desktop-initial.png', fullPage: true });
});
await check('打开选择器后搜索框获得焦点', async () => { await openBackup(); assert.equal(await input.evaluate(el => el === document.activeElement), true); });
await check('中文模型名搜索', async () => {
 await openBackup(); await input.fill('Kimi 模型'); assert.equal(await matches().count(), 3);
 assert.match(await matches().first().innerText(), /Openrouter.*kimi-k2\.6/s);
 await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/desktop-search-zh.png' });
});
await check('ID 子串搜索', async () => { await openBackup(); await input.fill('deepseek/model-7'); assert.equal(await matches().count(), 33); });
await check('多词交叉搜索', async () => { await openBackup(); await input.fill('openrouter model-7'); assert.equal(await matches().count(), 11); });
await check('密钥状态通过可访问描述关联到模型选项', async () => {
 await openBackup();
 const descriptions = await matches().evaluateAll(elements => elements.map(element => {
  const id = element.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent?.trim() ?? '' : '';
 }));
 assert.equal(descriptions.length, 240);
 assert.equal(descriptions.every(description => description === '已配置密钥' || description === '未配置密钥'), true);
 assert.ok(descriptions.includes('已配置密钥'));
 assert.ok(descriptions.includes('未配置密钥'));
});
await check('供应商筛选不改已保存选择', async () => {
 await page.keyboard.press('Escape');
 const before = await backup.innerText();
 await provider.click(); await page.getByRole('button', { name: 'OpenCode Go', exact: true }).click();
 assert.equal((await backup.innerText()).trim(), before.trim());
 await openBackup(); assert.equal(await matches().count(), 80); assert.equal((await matches().first().innerText()).includes('OpenCode Go'), true);
 await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/desktop-provider-filter.png' });
});
await check('供应商与仅已配置密钥联合筛选', async () => {
 await page.keyboard.press('Escape');
 await provider.click(); await page.getByRole('button', { name: 'OpenCode Go', exact: true }).click();
 await page.getByRole('checkbox', { name: '仅显示已配置密钥' }).check();
 await openBackup(); assert.equal(await matches().count(), 80);
 assert.equal((await matches().first().innerText()).includes('OpenCode Go'), true);
 assert.equal((await matches().last().innerText()).includes('OpenCode Go'), true);
});
await check('搜索无结果提示', async () => { await openBackup(); await input.fill('没有这个模型'); await page.getByRole('status').filter({ hasText: '没有匹配的模型' }).waitFor(); assert.equal(await matches().count(), 0); });
await check('ArrowDown 与 Enter 选择且焦点回到触发器', async () => {
 await openBackup(); await input.fill('openrouter model-7'); await input.press('ArrowDown');
 assert.equal(await matches().first().evaluate(el => el === document.activeElement), true);
 await page.keyboard.press('Enter');
 assert.equal(await backup.evaluate(el => el === document.activeElement), true);
 assert.match(await backup.innerText(), /Openrouter.*model-7/);
});
await check('重开清空搜索', async () => { await openBackup(); assert.equal(await input.inputValue(), ''); await input.fill('model-23'); await page.keyboard.press('Escape'); assert.equal(await backup.evaluate(el => el === document.activeElement), true); await openBackup(); assert.equal(await input.inputValue(), ''); });
await check('大列表内部滚动', async () => {
 await openBackup(); await input.fill('');
 const scroller = page.locator('.max-h-60.overflow-y-auto');
 const before = await scroller.evaluate(el => el.scrollTop); await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
 const after = await scroller.evaluate(el => el.scrollTop); assert.ok(after > before); assert.ok(after > 0);
 await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/desktop-list-scrolled.png' });
});
await check('向上翻转并保持视口内', async () => {
 await page.keyboard.press('Escape');
 await page.evaluate(() => { document.querySelector('main').style.marginTop = '650px'; window.scrollTo(0, document.body.scrollHeight); });
 await openBackup();
 const menuId = await backup.getAttribute('aria-controls'); const box = await page.locator(`[id="${menuId}"]`).locator('..').boundingBox();
 assert.ok(box); assert.ok(box.y >= 0); assert.ok(box.y + box.height <= 900);
 await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/desktop-flip.png' });
});
await check('800x700 无横向溢出且菜单在视口内', async () => {
 await page.setViewportSize({ width: 800, height: 700 }); await page.evaluate(() => window.scrollTo(0, 0));
 await openBackup();
 const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); assert.equal(dims.sw, dims.iw);
 const menuId = await backup.getAttribute('aria-controls'); const box = await page.locator(`[id="${menuId}"]`).locator('..').boundingBox(); assert.ok(box); assert.ok(box.x >= 0 && box.x + box.width <= 800 && box.y >= 0 && box.y + box.height <= 700);
 await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/narrow-800.png', fullPage: true });
});
await check('390px 辅助窄窗无横向溢出', async () => { await page.setViewportSize({ width: 390, height: 844 }); const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); assert.equal(dims.sw, dims.iw); await page.screenshot({ path: 'dev-docs/model-picker-catalog-20261018/narrow-390.png', fullPage: true }); });
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (report.failures.length || report.pageErrors.length || report.consoleErrors.length) process.exitCode = 1;
