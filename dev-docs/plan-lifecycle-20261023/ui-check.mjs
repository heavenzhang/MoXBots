import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'evidence');
fs.mkdirSync(out, { recursive: true });
const scenes = [
  ['待确认', '待确认'], ['方案已确认', '方案已确认'], ['启动 pending', '等待启动'], ['启动 claimed', '启动核对中'], ['启动 dispatched', '执行状态待核实'],
  ['执行中', '执行中'], ['回传待验收', '待主 Agent 验收'], ['失败', '执行失败'], ['返工', '待返工'], ['中断', '执行已中断'],
  ['阻塞', '待执行'], ['全部步骤受阻', '执行受阻'], ['未知', '执行状态待核实'], ['全部验收完成', '已完成 · 验收通过'], ['旧版本迟到结果', '方案已确认'], ['断线恢复', '执行状态待核实'],
];
const browser = await chromium.launch({ headless: true, ...(process.env.PLAN_REVIEW_CHROMIUM ? { executablePath: process.env.PLAN_REVIEW_CHROMIUM } : {}) });
const results = [];
try {
  for (const width of [1280, 390, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1280 ? 900 : 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4349/dev-docs/plan-lifecycle-20261023/preview.html');
    await page.getByText('当前合成场景：待确认', { exact: true }).waitFor();
    if (dark) await page.getByRole('button', { name: '切换主题' }).click();
    for (const [scene, expected] of scenes) {
      await page.getByRole('button', { name: scene, exact: true }).click();
      await page.getByText(`当前合成场景：${scene}`, { exact: true }).waitFor();
      await page.getByRole('heading', { name: scene === '待确认' ? '计划草案' : '执行计划' }).waitFor();
      const phases = await page.locator('[data-ledger-phases]').getAttribute('data-ledger-phases');
      if (scene === '旧版本迟到结果') assert.match(phases, /repair:completed/, 'old accepted row exists in fixture but must not satisfy the current revision');
      if (scene === '阻塞') assert.match(phases, /inspect:pending,repair:blocked,accept:blocked/, 'a ready step remains actionable while dependents are blocked');
      if (scene === '全部步骤受阻') assert.match(phases, /inspect:blocked,repair:blocked,accept:blocked/);
      const badge = await page.locator('section[aria-labelledby] [role="status"]').first().innerText();
      assert.ok(badge.includes(expected), `${width}px ${dark ? 'dark' : 'light'} ${scene}: expected ${expected}, got ${badge}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${width}px ${dark ? 'dark' : 'light'} ${scene}: horizontal overflow ${overflow}px`);
      if (scene === '全部验收完成') {
        const card = page.locator('section[aria-labelledby]').first();
        const disclosure = card.locator('details > summary').first();
        await disclosure.focus(); await page.keyboard.press('Enter');
        await card.getByText(/主 Agent 验收依据/).first().waitFor({ state: 'visible' });
        assert.match(await card.innerText(), /验收证据/);
        await card.getByRole('button', { name: '查看执行记录' }).first().click();
        await page.getByLabel('合成工具记录路由').waitFor();
        assert.equal(await page.getByLabel('合成工具记录路由').getAttribute('data-inspected-tool-id'), 'tool-inspect');
        await page.screenshot({ path: path.join(out, `${width}-${dark ? 'dark' : 'light'}-accepted.png`), fullPage: true });
      }
      if (['回传待验收', '未知', '断线恢复'].includes(scene)) await page.screenshot({ path: path.join(out, `${width}-${dark ? 'dark' : 'light'}-${scene.replaceAll(' ', '-')}.png`), fullPage: true });
      if (scene === '断线恢复') {
        await page.getByRole('button', { name: '断开快照' }).click();
        await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('同步待恢复'), null, { timeout: 6000 });
        assert.equal(await page.locator('[data-ledger-phases]').getAttribute('data-ledger-phases'), phases, 'disconnect preserves last projected snapshot');
        await page.getByRole('button', { name: '恢复快照' }).click();
        await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('执行状态待核实'), null, { timeout: 6000 });
      }
      results.push({ width, dark, scene, expected, badge: badge.trim(), overflow });
    }
    assert.deepEqual(errors, [], `page errors at ${width}px ${dark ? 'dark' : 'light'}`);
    await page.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
