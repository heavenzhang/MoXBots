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
  cacheDir: await mkdtemp(resolve(tmpdir(), 'mb-composer-type-vite-')),
  optimizeDeps: { entries: [resolve(import.meta.dirname, 'fixture.tsx')], exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source', 'chartjs-umd-source?raw', 'd3-umd-source?raw', 'lucide-umd-source?raw'] },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  plugins: [{
    name: 'offline-composer-config', enforce: 'pre',
    resolveId(id) { if (id === '@/config/useConfigData' || id === resolve(root, 'src/renderer/config/useConfigData')) return '\0offline-composer-config'; },
    load(id) { if (id === '\0offline-composer-config') return 'export function useConfigData(){return {config:{chatSendShortcut:"enter"},projects:[]}}'; },
    configResolved(config) { config.server.proxy = undefined; },
    configureServer(vite) {
      vite.middlewares.use('/composer-qa', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/composer-qa', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{min-height:100%;margin:0;background:var(--paper)}</style></head><body><div id="root"></div><script type="module" src="/@fs/${root}/dev-docs/composer-type-20261027/fixture.tsx"></script></body></html>`));
      });
    },
  }],
});
const results = [];
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/composer-qa`;
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const executablePath = name === 'chromium' ? process.env.MOXBOTS_QA_CHROMIUM : process.env.MOXBOTS_QA_WEBKIT;
    const browser = await engine.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
      for (const [width, appearance] of [[1440, 'dark'], [1440, 'light'], [900, 'dark'], [390, 'light']]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
        // No external requests or backend/real-account IO in this fixture.
        await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
        await page.goto(`${url}?appearance=${appearance}`);
        const main = page.getByTestId('main-composer');
        const input = main.getByRole('textbox');
        const ghost = main.getByTestId('next-prompt-ghost');
        try { await ghost.waitFor(); } catch (error) {
          await page.screenshot({ path: resolve(output, 'failure.png') });
          console.error((await page.locator('body').innerText()).slice(0, 1600));
          throw error;
        }
        await page.evaluate(() => document.fonts.ready);
        const typography = await ghost.evaluate(element => {
          const input = document.querySelector('[data-testid="main-composer"] textarea');
          const hint = document.querySelector('[id^="next-prompt-hint-"]');
          const css = getComputedStyle(element), tc = getComputedStyle(input);
          return { ghostFont: css.fontSize, ghostLine: css.lineHeight, inputFont: tc.fontSize, inputLine: tc.lineHeight,
            hintFont: getComputedStyle(hint).fontSize, ghostHeight: element.offsetHeight, ghostWidth: element.offsetWidth,
            inputWidth: input.offsetWidth, placeholderFont: getComputedStyle(input, '::placeholder').fontSize };
        });
        assert.equal(typography.ghostFont, '14px'); assert.equal(typography.inputFont, '14px');
        assert.equal(typography.placeholderFont, '14px'); assert.equal(typography.ghostLine, '26px');
        assert.equal(typography.inputLine, '26px'); assert.equal(typography.hintFont, '12px');
        assert.equal(typography.ghostWidth, typography.inputWidth);
        const suggestion = await ghost.textContent();
        await page.screenshot({ path: resolve(output, `${name}-${width}-${appearance}.png`) });
        await input.focus(); await input.press('Enter');
        await ghost.waitFor({ state: 'detached' });
        assert.equal(await input.inputValue(), suggestion);
        await input.evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
        const acceptedHeight = await input.evaluate(element => element.offsetHeight);
        assert(Math.abs(acceptedHeight - Math.max(52, typography.ghostHeight)) < 3, 'accepted suggestion retains its line geometry');
        assert.equal(await page.getByTestId('send-count').textContent(), '已发送 0');
        await input.fill('长文本输入与换行验证。'.repeat(100));
        await input.evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
        const geometry = await input.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.offsetHeight, scrollHeight: element.scrollHeight }));
        assert(geometry.scrollWidth <= geometry.width + 1, 'textarea has no horizontal overflow');
        assert(geometry.height <= 234 && geometry.scrollHeight > geometry.height, 'long draft caps at nine lines and scrolls');
        await input.fill('受控发送验证'); await input.press('Enter');
        await page.getByTestId('send-count').filter({ hasText: '已发送 1' }).waitFor();
        const textInput = page.getByRole('textbox', { name: '文本会话', exact: true });
        assert.equal(await textInput.evaluate(element => getComputedStyle(element).fontSize), '14px');
        await textInput.fill('文本会话发送'); await textInput.press('Enter');
        await page.getByTestId('send-count').filter({ hasText: '已发送 2' }).waitFor();
        assert.equal(await textInput.inputValue(), '');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow');
        await page.reload(); await ghost.waitFor(); await input.focus(); await input.press('Escape');
        await ghost.waitFor({ state: 'detached' }); assert.equal(await input.inputValue(), '');
        assert.deepEqual(errors, []);
        results.push({ engine: name, width, appearance, typography, geometry, suggestionAccept: true, suggestionDismiss: true, mainSend: true, textSend: true, noPageOverflow: true });
        console.log(`PASS ${name} ${width} ${appearance}`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ scope: 'offline production components; synthetic callbacks; not native/provider acceptance', results }, null, 2));
} finally { await server.close(); }
