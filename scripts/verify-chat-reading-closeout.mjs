// Offline terminal reading/selection replay in the real MessageList and Virtuoso.
// node scripts/verify-chat-reading-closeout.mjs [webkit|chromium] [--baseline]
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
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-reading-closeout-'));
const entryId = resolve(repo, 'src/renderer/__reading_closeout.tsx');
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
seed.push({id:'progress',type:'text',text:'READING_SELECTION_MARKER',textPhase:'commentary',isComplete:true});
const running={id:'current',type:'tool_use',tool:{id:'current-call',name:'Write',input:{file_path:'/tmp/current.txt',content:'Synthetic sample'},isLoading:true}};
const presentation={surfaceAvailable:true,generation:0};
function Fixture(){
 const [content,setContent]=useState([...seed,running]);
 const [loading,setLoading]=useState(true);
 const rootRef=useRef(null);
 const sm={id:'stream',role:'assistant',timestamp,transcriptState:loading?'streaming':'complete',runtimeTurnAnchor:{turnId:'turn',rootUserMessageId:'user'},content:loading?content:[...content,{id:'final',type:'text',text:'FINAL_RESULT_VISIBLE',textPhase:'final_answer',isComplete:true}]};
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
  plugins: [{ name: 'reading-closeout', enforce: 'pre',
    resolveId(id) { if (id === '/__reading_closeout.tsx') return entryId; },
    load(id) {
      if (id === entryId) return entry;
      if (baseline && id === resolve(repo, 'src/renderer/components/Message.tsx')) {
        return execFileSync('git', ['show', '05ea1e2c4d06f112585012a27503adc75c184dcc:src/renderer/components/Message.tsx'], { cwd: repo, encoding: 'utf8' });
      }
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/__reading_closeout') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<html><body style="margin:0"><div id="root"></div><script type="module" src="/__reading_closeout.tsx"></script></body></html>'));
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
  for (const mode of ['reader', 'selection', 'manual', 'following']) {
    await page.goto(server.resolvedUrls.local[0] + '__reading_closeout');
    await page.waitForFunction(() => window.audit?.snapshot().visibleRows === 25);
    await page.evaluate(() => window.audit.gap());
    await page.waitForTimeout(500);
    const marker = page.getByText('READING_SELECTION_MARKER', { exact: true });
    if (mode === 'reader') {
      await page.locator('[data-virtuoso-scroller]').hover();
      await page.mouse.wheel(0, -200);
    } else if (mode === 'selection') {
      await marker.evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
    } else if (mode === 'manual') {
      await page.locator('[data-message-id="stream"] [data-process-row] button[aria-expanded="false"]').last().click();
    }
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.audit.snapshot());
    const markerBefore = await marker.boundingBox();
    await page.evaluate(() => window.audit.setLoading(false));
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.audit.snapshot());
    const markerAfter = await marker.boundingBox();
    const selected = await page.evaluate(() => window.getSelection()?.toString());
    evidence.cases.push({mode,before,after,markerBefore,markerAfter,selected});
    await page.screenshot({path:resolve(output,mode+'.png')});
    if (mode === 'following') {
      assert.equal(after.visibleRows, 0, 'Following completion must still fold');
      await page.getByRole('button', {name:'查看执行过程',exact:true}).click();
      assert.equal(await page.evaluate(() => window.audit.snapshot().visibleRows),25);
    } else {
      assert.equal(after.follow,false,'Reading must pause follow');
      assert.equal(after.visibleRows,before.visibleRows,'Completion hid process content');
      assert.ok(Math.abs(markerBefore.y-markerAfter.y)<2,'Completion moved the reading anchor');
      if(mode==='selection') assert.equal(selected,'READING_SELECTION_MARKER','Completion lost selection');
      if(mode==='manual') assert.ok(await page.locator('[data-message-id="stream"] [data-process-row] button[aria-expanded="true"]').count()>0,'Completion closed tool detail');
      await page.getByRole('button', {name:'收起执行过程',exact:true}).click();
      assert.equal(await page.evaluate(() => window.audit.snapshot().visibleRows),0);
    }
    assert.ok(await page.getByText('FINAL_RESULT_VISIBLE',{exact:true}).isVisible());
  }
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
