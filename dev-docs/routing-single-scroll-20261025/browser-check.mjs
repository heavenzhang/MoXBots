import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.MYAGENTS_BUILD_PROFILE = 'moxbot';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(import.meta.dirname, 'evidence');
await mkdir(out, { recursive: true });
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve(tmpdir(), 'moxbots-routing-single-scroll-vite'),
  optimizeDeps: {
    entries: [resolve(import.meta.dirname, 'fixture.tsx')],
    exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source'],
  },
  server: { host: '127.0.0.1', port: 8948, strictPort: true, fs: { allow: [root] } },
  plugins: [{
    name: 'routing-single-scroll-fixture',
    configResolved(config) { config.server.proxy = undefined; },
    configureServer(vite) {
      vite.middlewares.use('/routing-scroll-qa', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/routing-scroll-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/routing-single-scroll-20261025/fixture.tsx"></script></body></html>`));
      });
    },
  }],
});
await server.listen();

const measurements = {};
const checks = [];
const errors = [];
try {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8948/routing-scroll-qa');
    const card = page.getByRole('region', { name: '自动选模型', exact: true });
    const list = card.getByRole('list');
    const outer = page.locator('#settings-scroll');
    await card.getByText('验收模型 17', { exact: true }).waitFor();
    assert.equal(await list.getByRole('listitem').count(), 17);
    assert.equal(await card.getByText('分档来源: 供应商目录', { exact: true }).count(), 17);
    assert((await card.getByRole('button', { name: /设置 .* 的档位/ }).count()) > 0);

    const measure = async label => {
      const value = await page.evaluate(() => {
        const outer = document.querySelector('#settings-scroll');
        const list = document.querySelector('[role="list"]');
        const card = document.querySelector('[aria-label="自动选模型"]');
        const listStyle = getComputedStyle(list);
        const nestedScrollers = [...card.querySelectorAll('*')].filter(element => {
          const style = getComputedStyle(element);
          return element.scrollHeight > element.clientHeight + 1 && /(auto|scroll)/.test(style.overflowY);
        }).map(element => ({ tag: element.tagName, className: element.className }));
        return {
          viewport: [innerWidth, innerHeight],
          outerClientHeight: outer.clientHeight,
          outerScrollHeight: outer.scrollHeight,
          listClientHeight: list.clientHeight,
          listScrollHeight: list.scrollHeight,
          listOverflowY: listStyle.overflowY,
          listMaxHeight: listStyle.maxHeight,
          rows: list.querySelectorAll('[role="listitem"]').length,
          nestedScrollers,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      measurements[label] = value;
      return value;
    };

    const initial = await measure('desktop');
    assert(initial.outerScrollHeight > initial.outerClientHeight);
    assert.equal(initial.listScrollHeight, initial.listClientHeight);
    assert.equal(initial.listOverflowY, 'visible');
    assert.equal(initial.listMaxHeight, 'none');
    assert.deepEqual(initial.nestedScrollers, []);
    assert.equal(initial.horizontalOverflow, false);
    checks.push('17 candidates have natural list height and only the outer settings container scrolls');
    await page.screenshot({ path: resolve(out, 'candidates-top.png') });

    const search = card.getByPlaceholder('搜索模型、名称或供应商');
    await search.fill('验收模型 17');
    assert.equal(await list.getByRole('listitem').count(), 1);
    await search.fill('');
    assert.equal(await list.getByRole('listitem').count(), 17);
    checks.push('search still filters and restores all candidates');

    const lastRow = list.getByRole('listitem').last();
    await lastRow.scrollIntoViewIfNeeded();
    assert((await outer.evaluate(element => element.scrollTop)) > 0);
    const bounds = await page.evaluate(() => {
      const list = document.querySelector('[role="list"]').getBoundingClientRect();
      const row = document.querySelector('[role="list"]').lastElementChild.getBoundingClientRect();
      return { listBottom: list.bottom, rowBottom: row.bottom };
    });
    assert(bounds.rowBottom <= bounds.listBottom + 1);
    await page.screenshot({ path: resolve(out, 'candidates-bottom.png') });

    await lastRow.getByRole('button', { name: /设置 .* 的档位/ }).click();
    await page.getByRole('button', { name: '强力', exact: true }).last().waitFor();
    await page.keyboard.press('Escape');
    await lastRow.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await lastRow.getByRole('button', { name: '移出', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await card.getByText('已保存。', { exact: true }).waitFor();
    checks.push('last row remains reachable; tier menu, pause/cancel and remove/confirm controls work');

    await card.getByRole('button', { name: '添加模型', exact: true }).click();
    const directoryRow = card.getByRole('checkbox', { name: /验收目录 18/ });
    await directoryRow.waitFor();
    const directory = await directoryRow.evaluate(element => {
      const container = element.closest('label').parentElement;
      const style = getComputedStyle(container);
      return { overflowY: style.overflowY, maxHeight: style.maxHeight, clientHeight: container.clientHeight, scrollHeight: container.scrollHeight };
    });
    assert.equal(directory.overflowY, 'visible');
    assert.equal(directory.maxHeight, 'none');
    assert.equal(directory.clientHeight, directory.scrollHeight);
    assert.deepEqual((await measure('add-panel')).nestedScrollers, []);
    checks.push('add-model directory also uses the outer scroll flow without clipping');
    await card.getByRole('button', { name: '关闭添加面板', exact: true }).click();

    await page.setViewportSize({ width: 390, height: 760 });
    const mobile = await measure('mobile');
    assert.equal(mobile.listScrollHeight, mobile.listClientHeight);
    assert.deepEqual(mobile.nestedScrollers, []);
    assert.equal(mobile.horizontalOverflow, false);
    await lastRow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, 'candidates-mobile-bottom.png') });
    checks.push('390px layout keeps all rows reachable without horizontal or nested scrolling');
    assert.deepEqual(errors, []);
    await writeFile(resolve(out, 'browser-result.json'), JSON.stringify({
      passed: true,
      environment: 'Real AutoRoutingSettings in Chromium with synthetic models and in-memory saves; not native or production acceptance',
      checks,
      measurements,
      errors,
    }, null, 2));
    console.log(JSON.stringify({ passed: true, checks, measurements, errors }));
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
