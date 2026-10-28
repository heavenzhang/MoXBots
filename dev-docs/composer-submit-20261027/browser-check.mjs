import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';

process.env.MYAGENTS_BUILD_PROFILE = 'moxbot';
const root = resolve(import.meta.dirname, '../..');
const output = resolve(import.meta.dirname, 'evidence');
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  cacheDir: await mkdtemp(resolve(tmpdir(), 'moxbots-composer-submit-vite-')),
  optimizeDeps: { entries: [resolve(import.meta.dirname, 'fixture.tsx')] },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  plugins: [{ name: 'composer-submit-qa',
    configResolved(config) { config.server.proxy = undefined; },
    configureServer(vite) {
      vite.middlewares.use('/composer-submit-qa', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/composer-submit-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#222d27}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/composer-submit-20261027/fixture.tsx"></script></body></html>`));
      });
    },
  }],
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/composer-submit-qa`;
const results = [];
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const executablePath = name === 'chromium' ? process.env.MOXBOTS_QA_CHROMIUM : process.env.MOXBOTS_QA_WEBKIT;
    const browser = await engine.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
      for (const width of [1440, 760, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        const input = page.getByRole('textbox');
        await input.fill('继续把任务编排做完，有困难么');
        const before = Date.now();
        await input.press('Enter');
        await page.getByText('模拟发送回执等待中').waitFor();
        assert.equal(await input.inputValue(), '');
        assert.equal(await page.getByTestId('sent-message').count(), 1);
        const clearObservedMs = Date.now() - before;
        await input.press('Enter');
        await input.fill('下一条草稿');
        await input.press('Enter');
        assert.equal(await page.getByTestId('sent-message').count(), 1);
        await page.evaluate(() => window.composerAudit.accept());
        await page.getByText('模拟发送已结束').waitFor();
        assert.equal(await input.inputValue(), '下一条草稿');
        await input.press('Enter');
        assert.equal(await input.inputValue(), '');
        await page.evaluate(() => window.composerAudit.reject());
        await page.waitForFunction(() => document.querySelector('textarea').value === '下一条草稿');
        // Chinese composition never submits the candidate-confirming Enter.
        const count = await page.getByTestId('sent-message').count();
        await input.dispatchEvent('compositionstart');
        await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
        await input.dispatchEvent('compositionend');
        assert.equal(await page.getByTestId('sent-message').count(), count);
        // A changed and then emptied next draft must stay empty on rejection.
        await input.press('Enter');
        await input.fill('下一稿后主动清空'); await input.fill('');
        await page.evaluate(() => window.composerAudit.reject());
        await page.getByText('模拟发送已结束').waitFor();
        assert.equal(await input.inputValue(), '');
        await page.evaluate(() => window.composerAudit.addImage());
        await input.fill('附件消息'); await input.press('Enter');
        assert.equal(await input.inputValue(), '');
        assert.equal(await page.getByRole('button', { name: 'synthetic.png', exact: true }).count(), 0);
        await page.screenshot({ path: resolve(output, `${name}-${width}-pending.png`) });
        await page.evaluate(() => window.composerAudit.reject());
        await page.waitForFunction(() => document.querySelector('textarea').value === '附件消息');
        await page.getByRole('button', { name: 'synthetic.png', exact: true }).waitFor();
        await page.screenshot({ path: resolve(output, `${name}-${width}-restored.png`) });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        assert.deepEqual(errors, []);
        results.push({ engine: name, width, clearObservedMs, delayedReceipt: 'unresolved until explicit test acceptance', immediateClear: true, duplicateBlocked: true, nextDraftPreserved: true, rejectionRestored: true, imeProtected: true, intentionalClearPreserved: true, attachmentRestored: true, horizontalOverflow: overflow });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(resolve(output, 'browser-results.json'), `${JSON.stringify({ environment: 'isolated loopback synthetic receipts; actual SimpleChatInput', results }, null, 2)}\n`);
  console.log(JSON.stringify(results));
} finally { await server.close(); }
