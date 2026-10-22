// Long process-message update and navigation regression, using real MessageList and Virtuoso.
// Usage: node scripts/verify-chat-switch-delay.mjs [webkit|chromium] [--baseline]
// Screenshots and geometry evidence are retained in the printed temporary directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
import { patchReactVirtuoso } from './patch-react-virtuoso.mjs';

const repo = resolve(import.meta.dirname, '..');
const baseline = process.argv.includes('--baseline');
patchReactVirtuoso(resolve(repo, 'node_modules/react-virtuoso'), true);
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-switch-baseline-'));
const engine = process.argv.find(arg => ['webkit', 'chromium'].includes(arg)) ?? 'webkit';
assert.ok(['webkit', 'chromium'].includes(engine), 'Choose webkit or chromium');
const entryId = repo + '/src/renderer/__scroll_audit.tsx';
const entry=`import React,{useState,useRef,useLayoutEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {i18n} from './i18n';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import './index.css';
import MessageList from './components/MessageList';
import {ImagePreviewProvider} from './context/ImagePreviewContext';
import {useChatScrollModel} from './hooks/useChatScrollModel';
import {useChatScrollController} from './hooks/useChatScrollController';
await i18n.changeLanguage('zh-CN');
window.localeStats={calls:0,ms:0};
for(const name of ['toLocaleTimeString','toLocaleString']){
 const original=Date.prototype[name];
 Date.prototype[name]=function(...args){const start=performance.now(); try{return original.apply(this,args);}finally{window.localeStats.calls++;window.localeStats.ms+=performance.now()-start;}};
}

const mk=(id,content,role='assistant')=>({id,content,role,timestamp:new Date(),streamingTextActive:true});
const seedMode=new URLSearchParams(location.search).get('seed');
const nl=String.fromCharCode(10),fence=String.fromCharCode(96).repeat(3);
const mixedHistory=Array.from({length:300},(_,i)=>mk('h'+i,i%20!==1?'Short user message '+i:[
 '## Report '+i,'| Column A | Column B |','| --- | --- |',
 Array(40).fill('| cell | table content |').join(nl),fence+'typescript',
 Array(60).fill('const value = 123;').join(nl),fence,
].join(nl),i%20!==1?'user':'assistant'));
const history=seedMode?mixedHistory:Array.from({length:25},(_,i)=>mk('h'+i,('History paragraph '+i+' with stable lines. ').repeat(15)));
function Fixture(){
 const [active,setActive]=useState(true);
 const [presentation,setPresentation]=useState({surfaceAvailable:true,generation:0});
 const loaded=true;
 const [sm,setSm]=useState(mk('stream',Array.from({length:372},(_,i)=>i%2===0?{id:'t'+i,type:'thinking',thinking:'Synthetic analysis. '.repeat(120),isComplete:true,executionTiming:{startedAt:Date.now()-120000+i*10,finishedAt:Date.now()-119000+i*10,source:'observed'}}:{id:'t'+i,type:'tool_use',tool:{id:'tool'+i,name:'Bash',input:{command:'pwd'},result:'Synthetic result. '.repeat(120),isLoading:false,executionTiming:{startedAt:Date.now()-120000+i*10,finishedAt:Date.now()-119000+i*10,source:'observed'}},executionTiming:{startedAt:Date.now()-120000+i*10,finishedAt:Date.now()-119000+i*10,source:'observed'}})));
 const [selection,setSelection]=useState('long');
 const loading=true;


 const height=640;
 const spacer=176;
 const rootRef=useRef(null);
 const model=useChatScrollModel({historyMessages:loaded?history:[],streamingMessage:loaded?sm:null,sessionId:'audit'});
 const ctrl=useChatScrollController({messages:model.data,isActive:active,windowPresentation:presentation,sessionId:'audit',rootRef});
 const onItemsRendered=useCallback(rows=>{window.auditEvents??=[];window.auditEvents.push({count:rows.length,missing:rows.filter(row=>!rootRef.current?.querySelector('[data-message-id="'+row.id+'"]')).map(row=>row.id)});ctrl.onItemsRendered();},[ctrl.onItemsRendered]);
 useLayoutEffect(()=>{window.audit={setSelection,setActive,
 append:text=>setSm(prev=>({...prev,content:[...prev.content,{id:'append'+prev.content.length,type:'thinking',thinking:text,isComplete:true,executionTiming:{startedAt:Date.now(),finishedAt:Date.now(),source:'observed'}}]})),snapshot:()=>{
  const el=ctrl.scrollerRef.current;
  return {top:el?.scrollTop,height:el?.scrollHeight,viewport:el?.clientHeight,gap:el?el.scrollHeight-el.scrollTop-el.clientHeight:null};
 },ctrl}});
 return <><button id='switch' onClick={()=>{window.switchHandledAt=performance.now();setSelection('other');setActive(false);}}>Other session</button><div id='selection'>{selection}</div>{selection==='other'&&<p>Other session is readable.</p>}<div ref={rootRef} style={{contentVisibility:active?'visible':'hidden',height,width:760,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
 <MessageList firstItemIndex={100000} messages={model.data} streamingMessage={loaded?sm:null} isActive={active} windowPresentation={presentation} isLoading={loading} sessionState={loading?'running':'idle'} isStreaming={loading} sessionId="audit"
 heightEstimateSeed={model.heightEstimateSeed} layoutByMessageId={model.layoutByMessageId} virtuosoRef={ctrl.virtuosoRef}
 onScrollerRef={ctrl.attachScroller} followEnabledRef={ctrl.followEnabledRef} scrollToBottom={ctrl.scrollToBottom} handleAtBottomChange={ctrl.handleAtBottomChange}
 onViewportAdmissionChanged={ctrl.onViewportAdmissionChanged} onItemsRendered={onItemsRendered} isViewportRecoveryFenced={ctrl.isViewportRecoveryFenced}
 onRowLayoutChanged={ctrl.onRowLayoutChanged} bottomSpacerPx={spacer}
  />
 </div></>;
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={null}><ImagePreviewProvider><Fixture/></ImagePreviewProvider></ThemeRuntimeProvider>);`;
const server = await createServer({
  configFile: resolve(repo, 'vite.config.ts'),
  cacheDir: resolve(output, 'vite-cache'),
  optimizeDeps: { exclude: [
    'chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source',
    'chartjs-umd-source?raw', 'd3-umd-source?raw', 'lucide-umd-source?raw',
  ] },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'chat-scroll-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__scroll_audit.tsx') return entryId; },
    load(id) {
      if (baseline && ['BlockGroup', 'ProcessRow'].some(name => id === resolve(repo, 'src/renderer/components', name + '.tsx'))) {
        const relative = id.slice(repo.length + 1);
        return execFileSync('git', ['show', 'c83b4c5b41a6a72f273c90aa7f1f768d916651ab:' + relative], { cwd: repo, encoding: 'utf8' });
      }
 if (id === entryId) return entry; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/__scroll_audit') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<html><head><style>:root{--font-body:Arial,sans-serif;--font-code:monospace;--paper:white;--ink:black;--ink-muted:#666}body{margin:0}[data-chat-status-row]{outline:2px solid rgb(255,0,255)}</style></head><body><div id="root"></div><script type="module" src="/__scroll_audit.tsx"></script></body></html>'));
      });
    },
  }],
});
let browser, page;
const errors=[];
try {
 await server.listen();
 browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
 page=await browser.newPage({viewport:{width:1000,height:800}});
 page.on('pageerror',e=>errors.push(e.message));
 const address=server.httpServer.address();
 await page.goto(`http://127.0.0.1:${address.port}/__scroll_audit?seed=immediate`);
 await page.waitForFunction(()=>window.audit?.ctrl.scrollerRef.current);
 await page.waitForTimeout(400);
 await page.evaluate(()=>window.audit.ctrl.scrollToBottom('auto'));
 await page.waitForTimeout(500);
 await page.screenshot({path:resolve(output,'long-process.png')});
 const before=await page.evaluate(()=>({events:window.auditEvents.length,stats:{...window.localeStats},snapshot:window.audit.snapshot()}));
 const updates=[];
 for(let i=0;i<4;i++){
  updates.push(await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();const stats={...window.localeStats}; window.audit.append('Synthetic new output.');requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({ms:performance.now()-start,calls:window.localeStats.calls-stats.calls,localeMs:window.localeStats.ms-stats.ms})));})));
 }
 await page.evaluate(()=>{let count=0;window.flood=setInterval(()=>{window.audit.append('Synthetic update.');if(++count>=40)clearInterval(window.flood);},50);});
 await page.waitForTimeout(300);
 const clickStart=performance.now(); await page.locator('#switch').click({timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#selection')?.textContent==='other',{timeout:20000});
 const switchMs=performance.now()-clickStart;
 await page.evaluate(()=>clearInterval(window.flood));
 await page.screenshot({path:resolve(output,'other-session.png')});
 await page.evaluate(()=>{window.audit.setSelection('long');window.audit.setActive(true);});
 await page.waitForTimeout(300);
 const after=await page.evaluate(()=>({stats:window.localeStats,events:window.auditEvents.length,snapshot:window.audit.snapshot()}));
 const report={engine,baseline,before,updates,switchMs,after,errors,scope:'Synthetic process-message flood; click includes browser automation time, not native App/AX latency'};
 await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report)); console.log('Evidence: '+output);
 assert.deepEqual(errors, []);
 assert.ok(after.snapshot.viewport > 0 && after.snapshot.height > after.snapshot.viewport, 'restored list has usable geometry');
 if (baseline) assert.ok(updates.some(update => update.calls > 1000), 'baseline should reproduce repeated work');
 else assert.ok(updates.every(update => update.calls <= 6), 'unchanged process rows must not reformat on append');

}finally{if(browser)await browser.close();await server.close();}
