import {chromium} from 'playwright';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';const output=new URL('./independent-evidence/',import.meta.url).pathname;const browser=await chromium.launch({headless:true,executablePath:'/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(() => {
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

const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8918/chat-info-qa');await page.getByLabel('验收状态').selectOption('done');await page.getByLabel('验收草稿').fill('窄屏修复复验');const checks=[];for(const [width,height] of [[390,844],[768,1024]]){await page.setViewportSize({width,height});await page.waitForTimeout(250);const summary=page.getByRole('button',{name:'本轮编辑 3 个文件',exact:true});const direct=page.getByRole('button',{name:'已编辑: reports/01-验收报告-会话恢复与权限隔离.md',exact:true});const geometry=await summary.evaluate(e=>({text:e.innerText,width:e.getBoundingClientRect().width}));if(width===390)assert.match(geometry.text,/3.*文件/);assert.ok(await direct.evaluate(e=>e.getBoundingClientRect().width)>64);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+width+'-light-label-final.png'});checks.push({width,geometry});}await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'本轮编辑 3 个文件',exact:true}).click();await page.getByRole('dialog',{name:'本轮文件编辑'}).waitFor();await page.getByRole('dialog',{name:'本轮文件编辑'}).getByRole('button',{name:'已编辑: reports/第三份结果.md',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('button',{name:'切换明暗',exact:true}).click();await page.getByRole('button',{name:'中 / EN',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:output+'390-dark-en-label-final.png'});assert.equal(await page.getByLabel('验收草稿').inputValue(),'窄屏修复复验');assert.deepEqual(errors,[]);const hashes=Object.fromEntries(await Promise.all(['src/renderer/components/TurnFileEditSummary.tsx','src/renderer/i18n/locales/zh-CN/app.json','src/renderer/i18n/locales/en-US/app.json'].map(async path=>[path,createHash('sha256').update(await readFile(new URL('../../'+path,import.meta.url))).digest('hex')])));await writeFile(output+'responsive-refresh.json',JSON.stringify({checks,hashes,errors},null,2));console.log(JSON.stringify({checks,errors}));await browser.close();