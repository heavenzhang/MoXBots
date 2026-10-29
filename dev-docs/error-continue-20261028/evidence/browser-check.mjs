import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('.', import.meta.url));
const results = [];
for (const [name, browserType] of Object.entries({ chromium, webkit })) {
  const executablePath = process.env[name === 'chromium' ? 'MB_CHROMIUM_EXECUTABLE' : 'MB_WEBKIT_EXECUTABLE'];
  const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, locale: 'zh-CN' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:4348/dev-docs/error-continue-20261028/evidence/ui.html');
      const receipts = async () => JSON.parse(await page.getByTestId('receipts').textContent());
      const mode = value => page.locator(`[data-mode="${value}"]`).click();
      await page.getByRole('button', { name: '继续执行', exact: true }).waitFor();
      assert.deepEqual(await receipts(), []);
      await page.screenshot({ path: `${output}${name}-${width}-partial.png` });
      await page.getByRole('button', { name: '继续执行', exact: true }).evaluate(button => { button.click(); button.click(); });
      await page.waitForFunction(() => document.querySelector('[data-testid="receipts"]')?.getAttribute('data-count') === '1');
      const continued = (await receipts())[0];
      assert.equal(continued.kind, 'continue'); assert.equal(continued.turnId, 't1');
      assert.ok(continued.text.includes('先只读核查实际状态'));
      assert.notEqual(continued.text, '完成示例任务的三个步骤');
      assert.equal(await page.getByRole('textbox', { name: 'draft' }).inputValue(), '保留这份尚未发送的草稿');

      await mode('unknown');
      const inspect = page.getByRole('button', { name: '核查状态', exact: true });
      await inspect.waitFor();
      assert.equal(await page.getByRole('button', { name: '重新发送', exact: true }).count(), 0);
      await page.screenshot({ path: `${output}${name}-${width}-unknown.png` });
      await inspect.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-testid="receipts"]')?.getAttribute('data-count') === '2');
      assert.deepEqual((await receipts())[1], { kind: 'inspect' });

      await mode('failed');
      await page.getByRole('button', { name: '重新发送', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="receipts"]')?.getAttribute('data-count') === '3');
      assert.deepEqual((await receipts())[2], { kind: 'resend', text: '完成示例任务的三个步骤' });

      await mode('partial'); await page.getByTestId('busy').click();
      assert.equal(await page.getByRole('button', { name: '继续执行', exact: true }).isDisabled(), true);
      await mode('failure'); await page.getByRole('button', { name: '继续执行', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="receipts"]')?.getAttribute('data-count') === '4');
      assert.deepEqual((await receipts())[3], { kind: 'unavailable' });
      await page.getByRole('button', { name: '继续执行', exact: true }).waitFor();
      await mode('complete');
      assert.equal(await page.getByRole('button', { name: '继续执行', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '核查状态', exact: true }).count(), 1);
      assert.equal(await page.getByRole('textbox', { name: 'draft' }).inputValue(), '保留这份尚未发送的草稿');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      results.push({ engine: name, width, status: 'PASS', checks: ['no-auto-execution', 'continue-exact-turn', 'no-original-replay', 'double-click', 'draft-preserved', 'uncertain-inspect-only', 'keyboard', 'definitive-resend', 'busy', 'recovery-failure', 'completed-no-continue', 'no-horizontal-overflow', 'no-page-errors'] });
      await page.close();
    }
  } finally { await browser.close(); }
}
await writeFile(`${output}browser-results.json`, JSON.stringify({ environment: 'isolated real product components; synthetic state and action receipts; no real Provider or native client', results }, null, 2) + '\n');
console.log(JSON.stringify(results));
