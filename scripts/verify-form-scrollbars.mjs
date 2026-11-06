// Offline layout/interaction regression against the real project editor.
// Run: node scripts/verify-form-scrollbars.mjs [webkit|chromium] [--baseline]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';

const repo = resolve(import.meta.dirname, '..');
const engine = process.argv[2] ?? 'webkit';
assert.ok(['webkit', 'chromium'].includes(engine));
const baseline = process.argv.includes('--baseline');
const output = await mkdtemp(resolve(tmpdir(), `moxbots-form-scrollbars-${engine}-`));
const entryId = resolve(repo, 'src/renderer/__form_scrollbars.tsx');
const baselineFiles = new Map(baseline ? [
  'src/renderer/index.css',
  'src/renderer/features/project-spaces/ProjectSpaceEditor.tsx',
].map(file => [resolve(repo, file), execFileSync('git', ['show', `13fb88204108a3b1ad9dc1b9a72cea6e673e94f4:${file}`], { cwd: repo, encoding: 'utf8' })]) : []);
const entry = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {i18n} from './i18n';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import ProjectSpaceEditor from './features/project-spaces/ProjectSpaceEditor';
import {ProjectSpaceError} from '../shared/projectSpaces';
import './index.css';
await i18n.changeLanguage('zh-CN');
const bots=Array.from({length:20},(_,i)=>({id:'bot-'+i,name:'验收 Bot '+i}));
const stamp='2026-11-06T00:00:00.000Z';
const latest={id:'fixture',name:'远端项目',description:'远端说明',instructions:'远端指令\\n'.repeat(150),memberBotIds:[],materials:[],resources:[],revision:2,createdAt:stamp,updatedAt:stamp};
function Fixture(){
 const [scheme,setScheme]=useState('dark'),[open,setOpen]=useState(true),[conflict,setConflict]=useState(false);
 return <ThemeRuntimeProvider selection={{themeId:'sage',appearanceMode:scheme}}><main>
 <select aria-label="外观" value={scheme} onChange={e=>setScheme(e.target.value)}><option>dark</option><option>light</option></select>
 <button onClick={()=>setOpen(true)}>打开项目表单</button><label><input aria-label="模拟版本冲突" type="checkbox" checked={conflict} onChange={e=>setConflict(e.target.checked)}/>模拟版本冲突</label>
 <div data-editor-exclusions style={{position:'absolute',left:0,top:80,width:200}}>
 <textarea aria-label="不换行字段" wrap="off" defaultValue={'unbroken'.repeat(100)}/>
 {['monaco-editor','cm-editor','xterm'].map(className=><div key={className} className={className}><textarea aria-label={className} style={{whiteSpace:'pre',overflow:'hidden'}} defaultValue="editor input sink"/></div>)}
 </div>
 {open&&<ProjectSpaceEditor bots={bots} onClose={()=>setOpen(false)} onReload={async()=>latest} onSave={async draft=>{if(conflict)throw new ProjectSpaceError('revision-conflict','stale'); window.__saved=draft; return {...latest,...draft};}}/>}
 </main></ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`;

const server = await createServer({
  configFile: resolve(repo, 'vite.config.ts'),
  cacheDir: resolve(output, 'vite-cache'),
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'form-scrollbar-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__form_scrollbars.tsx') return entryId; },
    load(id) { return id === entryId ? entry : baselineFiles.get(id); },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__form_scrollbars') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__form_scrollbars.tsx"></script></body></html>'));
      });
    },
  }],
});
let browser;
const results = [], errors = [], failures = [];
function check(condition, message) { if (!condition) failures.push(message); }
try {
  await server.listen();
  browser = await (engine === 'webkit' ? webkit : chromium).launch({
    headless: true,
    ...(process.env.MOXBOTS_FORM_TEST_BROWSER ? { executablePath: process.env.MOXBOTS_FORM_TEST_BROWSER } : {}),
  });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__form_scrollbars`, { waitUntil: 'commit' });
  await page.getByRole('dialog').waitFor({ timeout: 60_000 });
  const samples = {
    empty: '',
    short: '中文说明和 English input，正常换行。',
    url: 'https://example.invalid/' + 'very-long-path-without-spaces/'.repeat(80),
    multiline: Array.from({ length: 80 }, (_, i) => '第' + i + '行：中文说明与 English text').join('\n'),
  };
  const viewports = baseline ? [[1440, 900]] : [[1440, 900], [900, 600], [520, 600], [390, 844]];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const scheme of baseline ? ['dark'] : ['light', 'dark']) {
      await page.getByRole('combobox', { name: '外观' }).selectOption(scheme, { force: true });
      for (const zoom of baseline ? [1] : [1, 1.25, 2]) {
        // Smaller CSS viewports model the layout space available after native
        // page zoom. CSS zoom would leave dvh units unscaled, unlike WKWebView.
        await page.setViewportSize({ width: Math.round(width / zoom), height: Math.round(height / zoom) });
        const dialog = page.getByRole('dialog');
        for (const [kind, value] of Object.entries(samples)) {
          const text = dialog.locator('textarea').nth(1);
          await text.fill(value);
          await text.evaluate(el => { el.blur(); el.scrollTop = 0; });
          const metrics = await dialog.evaluate(el => {
            const area = el.querySelector('textarea[placeholder]'), fieldset = el.querySelector('fieldset'), footer = el.querySelector('footer');
            const body = fieldset.parentElement.tagName === 'DIV' ? fieldset.parentElement : fieldset;
            const box = el.getBoundingClientRect(), textBox = area.getBoundingClientRect();
            const style = getComputedStyle(area);
            return {
              overflowX: style.overflowX, overflowY: style.overflowY,
              textHeight: area.clientHeight, textScrollHeight: area.scrollHeight,
              textFits: textBox.left >= box.left && textBox.right <= box.right + 1,
              footerHeight: footer.clientHeight, footerScrollHeight: footer.scrollHeight,
              bodyHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight,
              pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              dialogFits: box.top >= -1 && box.bottom <= innerHeight + 1,
            };
          });
          results.push({ width, height, scheme, zoom, kind, ...metrics });
          const label = `${width}/${scheme}/${zoom}/${kind}`;
          check(metrics.overflowX === 'hidden', label + ': text has horizontal scroll policy');
          check(metrics.overflowY === 'auto', label + ': vertical scrolling lost');
          check(metrics.footerScrollHeight <= metrics.footerHeight + 1, label + ': ordinary footer scrolls');
          check(metrics.textFits && !metrics.pageOverflow && metrics.dialogFits, label + ': layout escapes viewport');
          const textBox = await text.boundingBox();
          await page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
          await page.mouse.wheel(120, 0);
          await page.waitForTimeout(30);
          check(await text.evaluate(el => el.scrollLeft === 0), label + ': horizontal wheel pans text');
          check(await text.inputValue() === value, label + ': text changed');
          if (kind === 'multiline' || kind === 'url') {
            check(metrics.textScrollHeight > metrics.textHeight, label + ': long text clipped instead of wrapping/scrolling');
            await text.evaluate(el => { el.scrollTop = el.scrollHeight; });
            check(await text.evaluate(el => el.scrollTop > 0), label + ': long text cannot scroll vertically');
            await text.press('Control+End');
            await text.press('End');
          }
          if (kind === 'empty' && zoom === 1 && scheme === 'dark') {
            await page.screenshot({ path: resolve(output, `${width}-empty.png`) });
          }
        }
        // The content area scrolls; the action stays in view and materials are editable.
        await page.getByRole('button', { name: '添加文字资料' }).click();
        const material = dialog.locator('textarea').nth(2);
        await material.fill(samples.url);
        check(await material.inputValue() === samples.url, 'material draft lost');
        await page.getByRole('button', { name: '移除这条资料' }).click();
        const cancel = page.getByRole('button', { name: '取消', exact: true });
        check(await cancel.evaluate(el => { const box = el.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), 'cancel action outside viewport');
      }
    }
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await page.setViewportSize({ width: 900, height: 600 });
  const name = page.getByLabel('项目名称', { exact: true });
  await name.fill('本地合成项目');
  await page.getByLabel('项目目标与说明', { exact: true }).fill(samples.short);
  await page.getByRole('dialog').locator('textarea').nth(1).fill(samples.multiline);
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(await page.evaluate(value => window.__saved.instructions === value, samples.multiline), 'save changed draft');
  await page.getByLabel('模拟版本冲突').check();
  await page.getByRole('button', { name: '打开项目表单' }).click();
  await name.fill('冲突时保留草稿');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: '查看最新版本' }).click();
  await page.getByText('远端项目', { exact: false }).waitFor();
  check(await name.inputValue() === '冲突时保留草稿', 'conflict review lost draft');
  const footer = page.getByRole('dialog').locator('footer');
  await footer.evaluate(el => { el.scrollTop = el.scrollHeight; });
  check(await footer.evaluate(el => el.scrollTop > 0), 'long conflict review must remain scrollable');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const exclusions = await page.locator('[data-editor-exclusions] textarea').evaluateAll(areas => areas.map(el => ({ whiteSpace: getComputedStyle(el).whiteSpace, overflowX: getComputedStyle(el).overflowX })));
  check(exclusions[0].whiteSpace === 'pre' && exclusions[0].overflowX === 'auto', 'wrap=off field changed');
  check(exclusions.slice(1).every(el => el.whiteSpace === 'pre' && el.overflowX === 'hidden'), 'editor input sink changed');
  check(errors.length === 0, 'page errors: ' + errors.join('; '));
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ engine, version: browser.version(), baseline, status: 'PASS', cases: results.length, output }));
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ engine, baseline, results, failures, errors }, null, 2));
  console.log(`Evidence: ${output}`);
  await browser?.close();
  await server.close();
}
