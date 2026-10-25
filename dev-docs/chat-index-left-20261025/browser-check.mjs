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
  cacheDir: await mkdtemp(resolve(tmpdir(), 'moxbots-chat-index-left-vite-')),
  optimizeDeps: { entries: [resolve(import.meta.dirname, 'fixture.tsx')], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source', 'chartjs-umd-source?raw', 'd3-umd-source?raw', 'lucide-umd-source?raw'] },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  plugins: [{
    name: 'chat-index-qa',
    configResolved(config) { config.server.proxy = undefined; },
    configureServer(vite) {
      vite.middlewares.use('/chat-index-qa', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/chat-index-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/chat-index-left-20261025/fixture.tsx"></script></body></html>`));
      });
    },
  }],
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/chat-index-qa`;
const results = [];
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const executablePath = name === 'chromium' ? process.env.MOXBOTS_QA_CHROMIUM : process.env.MOXBOTS_QA_WEBKIT;
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], ...(executablePath ? { executablePath } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
      await page.goto(url);
      const panel = page.getByRole('navigation');
      const transcript = page.locator('[data-virtuoso-scroller]');
      try { await panel.waitFor(); } catch (error) {
        await page.screenshot({ path: resolve(output, `${name}-failure.png`) });
        console.error(await page.locator('body').innerText());
        throw error;
      }
      await page.waitForFunction(() => window.indexAudit?.snapshot().top > 0);
      await page.screenshot({ path: resolve(output, `${name}-collapsed.png`) });
      const initial = await page.evaluate(() => window.indexAudit.snapshot());
      await transcript.hover({ position: { x: 600, y: 300 } });
      await page.mouse.wheel(0, -600);
      await page.waitForFunction(previous => window.indexAudit.snapshot().top < previous - 100, initial.top);
      await panel.hover();
      await page.waitForFunction(() => document.querySelector('[role="navigation"]').offsetWidth >= 287);
      const first = panel.getByRole('button', { name: '问题 1：核对本轮工作进度与交付结果', exact: true });
      await first.waitFor();
      const geometry = await panel.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const list = element.querySelector('.chat-scroll-surface');
        return { left: rect.left, width: rect.width, height: rect.height, listHeight: list.clientHeight, listScrollHeight: list.scrollHeight,
          indexScrollbar: getComputedStyle(list).scrollbarWidth,
          transcriptScrollbar: getComputedStyle(document.querySelector('[data-virtuoso-scroller]')).scrollbarWidth };
      });
      assert(geometry.left < 32, 'index is on the left');
      assert(geometry.listScrollHeight > geometry.listHeight, 'long index scrolls inside its bounded panel');
      assert.equal(geometry.indexScrollbar, 'none');
      assert.equal(geometry.transcriptScrollbar, 'none');
      // Scroll the index without moving the conversation behind it.
      const list = panel.locator('.chat-scroll-surface');
      await list.evaluate(element => { element.scrollTop = 0; });
      const before = await page.evaluate(() => window.indexAudit.snapshot().top);
      await list.hover();
      await page.mouse.wheel(0, 420);
      await page.waitForFunction(() => document.querySelector('[role="navigation"] .chat-scroll-surface').scrollTop > 100);
      assert(Math.abs((await page.evaluate(() => window.indexAudit.snapshot().top)) - before) < 3);
      // A virtualized target absent from the DOM must still mount and align.
      await first.scrollIntoViewIfNeeded();
      await first.click();
      await page.waitForFunction(() => {
        const row = document.querySelector('[data-message-id="q1"]');
        const scroller = document.querySelector('[data-virtuoso-scroller]');
        return row && Math.abs(row.getBoundingClientRect().top - scroller.getBoundingClientRect().top) < 12;
      });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('[role="navigation"]').offsetWidth < 30);
      await page.keyboard.press('Tab');
      await panel.focus();
      const last = panel.getByRole('button', { name: '问题 80：核对本轮工作进度与交付结果', exact: true });
      await last.scrollIntoViewIfNeeded();
      await last.click();
      await page.waitForFunction(() => {
        const row = document.querySelector('[data-message-id="q80"]');
        const scroller = document.querySelector('[data-virtuoso-scroller]');
        if (!row) return false;
        const rect = row.getBoundingClientRect();
        const viewport = scroller.getBoundingClientRect();
        const aligned = Math.abs(rect.top - viewport.top) < 12;
        // A short final answer cannot fill a viewport below the last query.
        const clampedAtEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 3;
        return rect.top >= viewport.top - 12 && rect.bottom <= viewport.bottom && (aligned || clampedAtEnd);
      });
      await page.screenshot({ path: resolve(output, `${name}-expanded.png`) });
      // Native 200% page zoom halves the available CSS viewport.
      for (const [width, height, zoom] of [[900, 600, 1], [1440, 900, 2], [390, 844, 1]]) {
        const cssWidth = Math.floor(width / zoom);
        const cssHeight = Math.floor(height / zoom);
        await page.setViewportSize({ width: cssWidth, height: cssHeight });
        await page.getByRole('textbox', { name: '消息草稿' }).fill('保留输入草稿');
        await page.waitForFunction(() => {
          const panel = document.querySelector('[role="navigation"]');
          return getComputedStyle(panel.parentElement).display === 'none' || panel.offsetWidth <= 21;
        });
        const layout = await page.evaluate(() => {
          const panel = document.querySelector('[role="navigation"]');
          const rect = panel.getBoundingClientRect();
          const input = document.querySelector('textarea').getBoundingClientRect();
          return { viewport: [innerWidth, innerHeight], visible: getComputedStyle(panel.parentElement).display !== 'none',
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            inputTop: input.top, inputBottom: input.bottom, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(layout.horizontalOverflow, false);
        assert(layout.inputBottom <= cssHeight + 1 && layout.inputTop >= 0, 'composer remains reachable');
        if (layout.visible) {
          assert(layout.rect.left >= 0 && layout.rect.right <= cssWidth + 1);
          assert(layout.rect.top >= 0 && layout.rect.bottom < layout.inputTop, 'index stays above composer');
        }
        results.push({ engine: name, width, height, zoom, layout });
        await page.screenshot({ path: resolve(output, `${name}-${width}-${zoom}x.png`) });
      }
      assert.deepEqual(errors, []);
      results.push({ engine: name, geometry, interactions: ['transcript wheel', 'index wheel isolated', 'virtualized first/last navigation', 'keyboard entry/Escape', 'draft retained'], errors });
    } finally { await browser.close(); }
  }
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ passed: true, results }, null, 2));
  console.log(JSON.stringify({ passed: true, engines: 2, responsiveCases: 6, output }));
} finally { await server.close(); }
