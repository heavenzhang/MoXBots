// Browser QA of the actual mobile presentation with explicitly synthetic native replies.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.MOBILE_QA_ORIGIN ?? 'http://127.0.0.1:4391';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.MOBILE_QA_OUTPUT ?? 'output/mobile-session-navigation';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [];
try {
  for (const { width, height } of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 393, height: 852 }, { width: 427, height: 952 }, { width: 428, height: 844 }, { width: 768, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '选择 QA 演示场景' }).click();
    await page.getByRole('button', { name: '会话列表排版', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /打开会话：/ }).count(), 6);
    assert.ok(await page.getByRole('heading', { name: '今天', exact: true }).count());
    assert.ok(await page.getByRole('heading', { name: '昨天', exact: true }).count());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `directory-${width}.png`) });

    await page.getByRole('button', { name: '搜索会话', exact: true }).click();
    const search = page.getByRole('textbox', { name: '搜索当前 Bot 的会话', exact: true });
    await search.fill('不匹配的搜索词');
    await page.getByText('没有找到相关会话', { exact: true }).waitFor();
    await search.fill('产品方案');
    assert.equal(await page.getByRole('button', { name: /打开会话：/ }).count(), 1);
    await page.getByRole('button', { name: '会话信息：产品方案讨论', exact: true }).click();
    await page.getByRole('heading', { name: '会话信息', exact: true }).waitFor();
    assert.ok((await page.locator('body').innerText()).includes('此会话始终在原 Bot 和设备上继续'));
    await page.getByRole('button', { name: '继续此会话', exact: true }).click();
    const transcript = page.getByLabel('聊天消息', { exact: true });
    await transcript.waitFor();
    const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
    const draft = '保留在原会话里的可编辑草稿';
    await input.fill(draft);
    const resting = await transcript.boundingBox();
    await page.getByRole('button', { name: '更多操作：附件、语音和建议', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '添加到会话', exact: true });
    await menu.waitFor();
    const covered = await transcript.boundingBox();
    assert.deepEqual(covered, resting, 'opening optional tools must not resize or displace the transcript');
    await page.waitForTimeout(100);
    assert.ok(await menu.evaluate(el => el.contains(document.activeElement)), 'menu receives keyboard focus');
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press('Tab');
      assert.ok(await menu.evaluate(el => el.contains(document.activeElement)), 'Tab stays inside the open menu');
    }
    await page.screenshot({ path: path.join(output, `composer-menu-${width}.png`) });
    // Actual touch at the covered input/send coordinates must only dismiss the menu.
    const inputBounds = await input.boundingBox();
    await page.touchscreen.tap(inputBounds.x + inputBounds.width / 2, inputBounds.y + inputBounds.height / 2);
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), draft);
    assert.ok(await input.evaluate(el => el !== document.activeElement), 'covered input must not receive focus');
    await page.getByRole('button', { name: '更多操作：附件、语音和建议', exact: true }).click();
    await menu.waitFor();
    const sendBounds = await page.locator('[aria-label="发送消息"]').boundingBox();
    await page.touchscreen.tap(sendBounds.x + sendBounds.width / 2, sendBounds.y + sendBounds.height / 2);
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await transcript.getByText(draft, { exact: true }).count(), 0, 'covered send must never submit');
    assert.equal(await input.inputValue(), draft);
    await page.getByRole('button', { name: '更多操作：附件、语音和建议', exact: true }).click();
    await menu.waitFor();
    await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="添加到会话"]')?.contains(document.activeElement));
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), draft);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '更多操作：附件、语音和建议', undefined, { timeout: 2000 });
    assert.ok(await page.getByRole('button', { name: '更多操作：附件、语音和建议', exact: true }).evaluate(el => el === document.activeElement));
    await page.screenshot({ path: path.join(output, `conversation-${width}.png`) });

    // Open results from the compact toolbar, then return to the same draft/session.
    await page.getByRole('button', { name: '查看会话成果', exact: true }).click();
    await page.getByRole('button', { name: '返回会话', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `artifacts-${width}.png`) });
    await page.getByRole('button', { name: '返回会话', exact: true }).click();
    await input.waitFor();
    assert.equal(await input.inputValue(), draft);
    assert.equal(await transcript.getByText(draft, { exact: true }).count(), 0, 'opening results never sends the draft');
    await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
    assert.equal(await search.inputValue(), '产品方案', 'returning from a chat keeps the list search');
    await page.getByRole('button', { name: '清除并关闭搜索', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /打开会话：/ }).count(), 6);

    await page.getByRole('button', { name: '账号与设置', exact: true }).click();
    await page.getByRole('button', { name: /^个人资料，/ }).click();
    await page.getByText('资料由账号服务提供；当前暂不支持修改。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.getByRole('button', { name: /^会话提醒，/ }).click();
    await page.getByRole('heading', { name: '会话提醒', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.getByRole('heading', { name: '账号与设置', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `account-${width}.png`) });
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await page.getByText('新建远程会话', { exact: true }).waitFor();
    await input.fill('一条新的本地验收会话');
    await page.waitForFunction(() => document.querySelector('[aria-label="发送消息"]')?.getAttribute('aria-disabled') !== 'true');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await transcript.getByText('一条新的本地验收会话', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /打开会话：/ }).count(), 7, 'explicit first send creates exactly one synthetic session');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    results.push({ width, height, sessionsSearchAndGroups: true, boundInfoSheet: true, toolsDoNotResizeTranscript: true, menuKeyboardFocusAndEscape: true, menuOutsideTapDismissesWithoutEditOrSend: true, artifactReturnKeepsDraft: true, accountReturn: true, explicitNewSession: true, noPageErrorOrOverflow: true });
    await context.close();
  }
  await fs.writeFile(path.join(output, 'navigation-browser-results.json'), JSON.stringify({ at: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
