// Offline native-block boundary replay in the real MessageList and Virtuoso.
// node scripts/verify-chat-process-continuity.mjs [webkit|chromium] [--baseline]
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
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-process-continuity-'));
const entryId = resolve(repo, 'src/renderer/__process_continuity.tsx');
const entry = `
import React,{useState,useRef,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {i18n} from './i18n';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import {ImagePreviewProvider} from './context/ImagePreviewContext';
import MessageList from './components/MessageList';
import {useChatScrollModel} from './hooks/useChatScrollModel';
import {useChatScrollController} from './hooks/useChatScrollController';
import './index.css';
await i18n.changeLanguage('zh-CN');
const timestamp=new Date('2026-11-06T13:27:50Z');
const history=Array.from({length:30},(_,i)=>({id:'history-'+i,role:i%2?'assistant':'user',timestamp,content:'Stable history paragraph. '.repeat(20)}));
const seed=Array.from({length:24},(_,i)=>i%2?{id:'tool-'+i,type:'tool_use',tool:{id:'call-'+i,name:'Read',input:{file_path:'/tmp/sample-'+i+'.txt'},result:'Synthetic sample',isLoading:false}}:{id:'think-'+i,type:'thinking',thinking:'Inspect the next synthetic sample.',isComplete:true});
const running={id:'current',type:'tool_use',tool:{id:'current-call',name:'Write',input:{file_path:'/tmp/current.txt',content:'Synthetic sample'},isLoading:true}};
const presentation={surfaceAvailable:true,generation:0};
function Fixture(){
 const [content,setContent]=useState([...seed,running]);
 const [loading,setLoading]=useState(true);
 const rootRef=useRef(null);
 const sm={id:'stream',role:'assistant',timestamp,content};
 const model=useChatScrollModel({historyMessages:history,streamingMessage:sm,sessionId:'fixture'});
 const ctrl=useChatScrollController({messages:model.data,isActive:true,windowPresentation:presentation,sessionId:'fixture',rootRef});
 useLayoutEffect(()=>{window.audit={ctrl,setLoading,
  gap:()=>setContent(previous=>previous.map(block=>block.type==='thinking'?{...block,isComplete:true}:block.tool?.isLoading?{...block,tool:{...block.tool,isLoading:false,result:'Synthetic sample'}}:block)),
  next:()=>setContent(previous=>[...previous,previous.length%2?{id:'next-'+previous.length,type:'thinking',thinking:'Next sample',isComplete:false}:{id:'next-'+previous.length,type:'tool_use',tool:{id:'call-'+previous.length,name:'Read',input:{file_path:'/tmp/next.txt'},isLoading:true}}]),
  snapshot:()=>{const s=ctrl.scrollerRef.current,row=s?.querySelector('[data-message-id="stream"]');return {top:s?.scrollTop,height:s?.scrollHeight,view:s?.clientHeight,gap:s?s.scrollHeight-s.clientHeight-s.scrollTop:null,rowHeight:row?.getBoundingClientRect().height,visibleRows:row?Array.from(row.querySelectorAll('[data-process-row]')).filter(el=>el.getBoundingClientRect().height>0).length:0,follow:ctrl.followEnabledRef.current};}}});
 return <div ref={rootRef} style={{height:650,width:1000,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
 <MessageList firstItemIndex={100000} messages={model.data} streamingMessage={sm} isActive windowPresentation={presentation} isLoading={loading} sessionState={loading?'running':'idle'} isStreaming={loading} sessionId="fixture"
 heightEstimateSeed={model.heightEstimateSeed} layoutByMessageId={model.layoutByMessageId} virtuosoRef={ctrl.virtuosoRef}
 onScrollerRef={ctrl.attachScroller} followEnabledRef={ctrl.followEnabledRef} scrollToBottom={ctrl.scrollToBottom} handleAtBottomChange={ctrl.handleAtBottomChange}
 onViewportAdmissionChanged={ctrl.onViewportAdmissionChanged} onItemsRendered={ctrl.onItemsRendered} isViewportRecoveryFenced={ctrl.isViewportRecoveryFenced}
 onRowLayoutChanged={ctrl.onRowLayoutChanged} bottomSpacerPx={176}/></div>;
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={{themeId:'proof',appearanceMode:'dark'}}><ImagePreviewProvider><Fixture/></ImagePreviewProvider></ThemeRuntimeProvider>);
`;
const server = await createServer({
  configFile: resolve(repo, 'vite.config.ts'), cacheDir: resolve(output, 'vite-cache'),
  optimizeDeps: { exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source', 'chartjs-umd-source?raw', 'd3-umd-source?raw', 'lucide-umd-source?raw'] },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'process-continuity', enforce: 'pre',
    resolveId(id) { if (id === '/__process_continuity.tsx') return entryId; },
    load(id) {
      if (id === entryId) return entry;
      if (baseline && id === resolve(repo, 'src/renderer/components/Message.tsx')) {
        return execFileSync('git', ['show', '045b30eef4caf827249934539b6d0197674266b4:src/renderer/components/Message.tsx'], { cwd: repo, encoding: 'utf8' });
      }
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/__process_continuity') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<html><body style="margin:0"><div id="root"></div><script type="module" src="/__process_continuity.tsx"></script></body></html>'));
    }); },
  }],
});
let browser;
const evidence = { engine, baseline, cases: [] };
try {
  await server.listen();
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' && process.env.MOXBOTS_SCROLL_CHROMIUM_PATH
      ? { executablePath: process.env.MOXBOTS_SCROLL_CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) && route.request().method() === 'GET' ? route.continue() : route.abort();
  });
  await page.goto(server.resolvedUrls.local[0] + '__process_continuity');
  await page.waitForFunction(() => window.audit?.snapshot().visibleRows === 25);
  await page.waitForTimeout(500);
  for (let cycle = 0; cycle < 3; cycle++) {
    const before = await page.evaluate(() => window.audit.snapshot());
    await page.evaluate(() => window.audit.gap());
    await page.waitForTimeout(400);
    const gap = await page.evaluate(() => window.audit.snapshot());
    evidence.cases.push({ cycle, before, gap });
    await page.screenshot({ path: resolve(output, 'gap-' + cycle + '.png') });
    assert.ok(gap.visibleRows >= 25, 'An inter-block gap hid committed process rows');
    assert.ok(Math.abs(before.rowHeight - gap.rowHeight) < 100, 'An inter-block gap collapsed the process height');
    assert.ok(Math.abs(before.top - gap.top) < 100, 'An inter-block gap jumped the reading position');
    await page.evaluate(() => window.audit.next());
    await page.waitForTimeout(400);
  }
  // A deliberate reader scroll must survive a later block's completion.
  await page.locator('[data-virtuoso-scroller]').hover();
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(300);
  const reader = await page.evaluate(() => window.audit.snapshot());
  await page.evaluate(() => window.audit.gap());
  await page.waitForTimeout(300);
  const afterGap = await page.evaluate(() => window.audit.snapshot());
  assert.equal(afterGap.follow, false);
  assert.ok(Math.abs(reader.top - afterGap.top) < 2, 'Block completion overrode reader position');
  evidence.reader = { reader, afterGap };
  await page.evaluate(() => { window.audit.ctrl.scrollToBottom(); window.audit.setLoading(false); });
  await page.waitForTimeout(400);
  evidence.terminal = await page.evaluate(() => window.audit.snapshot());
  assert.equal(evidence.terminal.visibleRows, 0, 'A real terminal message did not fold history');
  const disclosure = page.getByRole('button', { name: /已完成 .* 个执行步骤/ });
  await disclosure.click();
  assert.equal(await page.evaluate(() => window.audit.snapshot().visibleRows), 28);
  assert.deepEqual(errors, []);
  evidence.status = 'PASS';
} catch (error) {
  evidence.status = 'FAIL';
  evidence.error = String(error);
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ output, ...evidence }));
  await browser?.close();
  await server.close();
}
