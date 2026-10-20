import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const productSources=['src/renderer/components/MessageList.tsx','src/renderer/components/BlockGroup.tsx','src/renderer/components/TurnFileEditSummary.tsx','src/renderer/utils/currentActivity.ts','src/renderer/utils/processResults.ts','src/renderer/i18n/locales/zh-CN/app.json','src/renderer/i18n/locales/en-US/app.json'];
const sourceHashes=Object.fromEntries(await Promise.all(productSources.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../../'+file,import.meta.url))).digest('hex')])));
const output=new URL('./independent-evidence/',import.meta.url).pathname;await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const context=await browser.newContext({viewport:{width:1440,height:900}});
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

const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];const warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')warnings.push(m.text())});await page.goto('http://127.0.0.1:8918/chat-info-qa');await page.getByLabel('验收状态').waitFor();await page.waitForTimeout(700);const checks=[];
const status=page.locator('[data-chat-status-row]');const chat=page.locator('[data-qa-chat]');
const chatHeight=await page.locator('[data-virtuoso-scroller]').evaluate(e=>e.getBoundingClientRect().height);assert.ok(chatHeight>300,'Actual chat scroller must have usable height');
await page.getByLabel('验收草稿').fill('独立验收保留草稿');
for(const [state,re] of [['read',/读取 CurrentCheck.ts/],['command',/验证修复、权限隔离/],['wait',/等待任务返回/],['model',/等待模型响应/],['permission',/等待你授权 Bash/],['question',/等待你补充信息/],['plan',/等待你确认计划/],['compacting',/总结|压缩/],['recovery',/等待模型恢复.*第2次/],['stopping',/正在停止/]]){await page.getByLabel('验收状态').selectOption(state);await page.waitForTimeout(100);assert.equal(await status.count(),1);assert.match(await status.innerText(),re);assert.equal(await status.evaluate(e=>e.getBoundingClientRect().height),30);if(['permission','question','plan'].includes(state))assert.equal(await status.locator('.animate-spin').count(),0);checks.push({state,text:await status.innerText()});}
await page.getByLabel('验收状态').selectOption('done');await page.waitForTimeout(100);assert.equal(await status.count(),0);assert.equal(await page.getByLabel('验收草稿').inputValue(),'独立验收保留草稿');
for(const [width,height] of [[1440,900],[768,1024],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(200);const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollerHeight:document.querySelector('[data-virtuoso-scroller]').getBoundingClientRect().height}));assert.ok(geometry.scrollWidth<=width);checks.push({geometry});await page.screenshot({path:output+width+'-light.png'});}
const phase=page.locator('[data-process-phase=explore]').first();const toggle=phase.locator('button').first();await toggle.scrollIntoViewIfNeeded();await toggle.focus();await toggle.press('Enter');assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.match(await phase.innerText(),/SessionRecovery.ts/);assert.match(await phase.innerText(),/PermissionGuard.ts/);await page.screenshot({path:output+'keyboard-expanded-390.png'});await toggle.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'),'false');checks.push({keyboardPhaseToggle:true});
const direct=page.getByRole('button',{name:/已(?:新增|编辑): reports\/01-验收报告-会话恢复与权限隔离\.md$/});await direct.scrollIntoViewIfNeeded();const directWidth=await direct.evaluate(e=>e.getBoundingClientRect().width);assert.ok(directWidth>64,'Direct filename must have visible room beside icon');checks.push({directFileWidth390:directWidth});await direct.focus();await direct.press('Enter');await page.getByText('受控传输预览：文件入口已通过原预览路径打开。',{exact:true}).waitFor();await page.screenshot({path:output+'preview-390.png'});const invocations=await page.evaluate(()=>window.__qaInvokes);assert.ok(invocations.some(i=>/check_(local_)?paths/.test(i.cmd)));assert.ok(invocations.some(i=>/read.*preview/.test(i.cmd)));checks.push({previewTransport:invocations.filter(i=>/check_(local_)?paths|read.*preview/.test(i.cmd))});await page.getByRole('button',{name:'关闭',exact:true}).last().click();
await page.getByRole('button',{name:/本轮编辑 3 个文件|3 个文件/}).click();const dialog=page.getByRole('dialog',{name:'本轮文件编辑'});await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:/已(?:新增|编辑): reports\/第三份结果\.md$/}).count(),1);await page.keyboard.press('Escape');checks.push({fullListAccess:true});
await page.getByRole('button',{name:'切换明暗',exact:true}).click();await page.getByRole('button',{name:'中 / EN',exact:true}).click();await page.getByLabel('验收状态').selectOption('read');assert.match(await status.innerText(),/Reading CurrentCheck.ts/);for(const [width,height] of [[390,844],[768,1024],[1440,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(120);await page.screenshot({path:output+width+'-dark-en.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}await page.setViewportSize({width:390,height:844});await page.getByLabel('验收状态').selectOption('command');await page.screenshot({path:output+'390-dark-en-long-status.png'});assert.deepEqual(errors,[]);await writeFile(output+'report.json',JSON.stringify({sourceHashes,environment:'loopback actual renderer with synthetic event/native transport; native/provider not accepted',checks,errors,warnings},null,2));console.log(JSON.stringify({checks:checks.length,errors,warnings},null,2));await browser.close();
