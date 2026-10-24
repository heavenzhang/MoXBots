import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, 'evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHAT_INFO_CHROMIUM ?? '/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Simulate only the native workspace transport. All UI, routing and preview
// surfaces below are real product components; no user's disk/account is read.
await context.addInitScript(() => {
  window.__qaInvokes = [];
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  let callback = 1;
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => callback++, unregisterCallback: () => {},
    invoke: async (cmd, args = {}) => {
      window.__qaInvokes.push({ cmd, args });
      if (/check_(local_)?paths/.test(cmd)) return { results: Object.fromEntries((args.paths ?? []).map(path => [path, { exists: true, type: 'file' }])) };
      if (/read.*preview/.test(cmd)) return { name: (args.path ?? args.fullPath).split('/').at(-1), content: '# 界面验收成果\n\n受控传输预览：文件入口已通过原预览路径打开。', size: 96 };
      if (/resolve.*preview_path/.test(cmd)) return `/fixture/${args.path ?? 'report.md'}`;
      if (cmd === 'plugin:event|listen') return callback++;
      if (cmd.includes('watch_start')) return { token: 'qa-watch', eventKey: 'qa-watch' };
      if (cmd.includes('platform')) return 'macos';
      return null;
    },
  };
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.log('PAGE_ERROR', error.message); });
page.on('console', message => { if (message.type() === 'error') console.log('BROWSER_ERROR', message.text().slice(0, 500)); });
await page.goto('http://127.0.0.1:8918/chat-info-qa', { waitUntil: 'networkidle' });
await page.getByLabel('验收状态').waitFor();
await page.locator('[data-chat-status-row]').waitFor();
assert.ok(await page.locator('[data-virtuoso-scroller]').evaluate(el => el.getBoundingClientRect().height) > 300);
const evidence = { environment: 'production MessageList/Message/BlockGroup/TurnFileEditSummary/FileActionProvider, synthetic events/native transport', errors, checks: [] };
const status = page.locator('[data-chat-status-row]');
assert.match(await status.innerText(), /正在读取 CurrentCheck.ts/);
assert.equal(await status.count(), 1);
assert.equal(await status.evaluate(el => el.getBoundingClientRect().height), 30);
await page.getByLabel('验收草稿').fill('切换状态后保留这条草稿');
for (const [state, expected] of [['command', /验证修复、权限隔离/], ['wait', /正在等待任务返回/], ['model', /等待模型响应/], ['compacting', /总结|压缩/], ['recovery', /等待模型恢复.*第2次/], ['stopping', /正在停止/]]) {
  await page.getByLabel('验收状态').selectOption(state);
  await page.waitForTimeout(80);
  assert.match(await status.innerText(), expected);
  evidence.checks.push({ state, status: await status.innerText(), height: await status.evaluate(el => el.getBoundingClientRect().height) });
}
for (const [state, expected] of [['permission', /等待你授权 Bash/], ['question', /等待你补充信息/], ['plan', /等待你确认计划/]]) {
  await page.getByLabel('验收状态').selectOption(state);
  assert.match(await status.innerText(), expected);
  assert.equal(await status.locator('.animate-spin').count(), 0);
  evidence.checks.push({ state, status: await status.innerText() });
}
await page.getByLabel('验收状态').selectOption('done');
await status.waitFor({ state: 'hidden' });
assert.equal(await page.getByLabel('验收草稿').inputValue(), '切换状态后保留这条草稿');
// Original public progress remains in order. Collapsed groups expose concrete
// result cues while each original result remains keyboard-expandable.
await page.getByText('关键进展：两个相关文件已经返回，修复记录和检查输出可展开核对。', { exact: true }).waitFor();
const result = page.locator('[data-phase-result]').first();
assert.match(await result.innerText(), /SessionRecovery.ts.*PermissionGuard.ts/);
const phase = page.locator('[data-process-phase="explore"]').first();
const phaseToggle = phase.locator('button').first();
await phaseToggle.focus();
await phaseToggle.press('Enter');
assert.equal(await phaseToggle.getAttribute('aria-expanded'), 'true');
await phaseToggle.press('Space');
assert.equal(await phaseToggle.getAttribute('aria-expanded'), 'false');
evidence.checks.push({ milestone: await result.innerText(), keyboardExpandCollapse: true });
await page.screenshot({ path: `${output}/01-wide-light.png` });
for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(150);
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth,
    actions: [...document.querySelectorAll('[data-role="assistant"] button')].filter(el => el.textContent.includes('验收报告')).map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width })) }));
  assert.ok(geometry.page <= geometry.viewport, JSON.stringify(geometry));
  evidence.checks.push({ viewport, geometry });
  await page.screenshot({ path: `${output}/02-width-${viewport.width}-light.png` });
}
const direct = page.getByRole('button', { name: '已编辑: reports/01-验收报告-会话恢复与权限隔离.md', exact: true });
await direct.scrollIntoViewIfNeeded();
await direct.focus();
await direct.press('Enter');
await page.getByText('受控传输预览：文件入口已通过原预览路径打开。', { exact: true }).waitFor();
assert.ok((await page.evaluate(() => window.__qaInvokes)).some(item => /read.*preview/.test(item.cmd) && item.args.path?.includes('验收报告')));
await page.screenshot({ path: `${output}/03-file-preview-390.png` });
await page.getByRole('button', { name: '关闭', exact: true }).last().click();
await page.getByText('受控传输预览：文件入口已通过原预览路径打开。', { exact: true }).waitFor({ state: 'hidden' });
await page.getByRole('button', { name: /本轮编辑 3 个文件/ }).click();
await page.getByRole('dialog', { name: '本轮文件编辑' }).waitFor();
await page.getByRole('dialog', { name: '本轮文件编辑' }).getByRole('button', { name: '已编辑: reports/第三份结果.md', exact: true }).waitFor();
await page.keyboard.press('Escape');
await page.getByRole('button', { name: '切换明暗', exact: true }).click();
await page.getByRole('button', { name: '中 / EN', exact: true }).click();
await page.getByLabel('验收状态').selectOption('read');
assert.match(await status.innerText(), /Reading CurrentCheck.ts/);
await page.screenshot({ path: `${output}/04-dark-english-390.png` });
assert.deepEqual(errors, []);
evidence.checks.push({ directFileNativeReadAndPreview: true, fullListThirdFile: true, noExtraStatusHeight: true, darkEnglishNarrow: true, draftPreserved: true });
await writeFile(`${output}/ui-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
await browser.close();
