// Offline regression using real Message/Markdown, controller, CSS and Virtuoso.
// Usage: node scripts/verify-chat-blank.mjs webkit (or chromium).
// Screenshots and geometry evidence are retained in the printed temporary directory.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
import { patchReactVirtuoso } from './patch-react-virtuoso.mjs';

const repo = resolve(import.meta.dirname, '..');
patchReactVirtuoso(resolve(repo, 'node_modules/react-virtuoso'), true);
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-blank-verification-'));
const engine = process.argv[2] ?? 'webkit';
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
import {useChatSearch} from './hooks/useChatSearch';
await i18n.changeLanguage('zh-CN');
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
 const [loaded,setLoaded]=useState(seedMode!=='deferred');
 const [sm,setSm]=useState(mk('stream','Streaming start.'));
 const [loading,setLoading]=useState(true);
 const [permission,setPermission]=useState(false);
 const [searchOpen,setSearchOpen]=useState(false);
 const [height,setHeight]=useState(640);
 const [spacer,setSpacer]=useState(176);
 const rootRef=useRef(null);
 const model=useChatScrollModel({historyMessages:loaded?history:[],streamingMessage:loaded?sm:null,sessionId:'audit'});
 const ctrl=useChatScrollController({messages:model.data,isActive:active,windowPresentation:presentation,sessionId:'audit',rootRef});
 const onItemsRendered=useCallback(rows=>{window.auditEvents??=[];window.auditEvents.push({count:rows.length,missing:rows.filter(row=>!rootRef.current?.querySelector('[data-message-id="'+row.id+'"]')).map(row=>row.id)});ctrl.onItemsRendered();},[ctrl.onItemsRendered]);
 const search=useChatSearch({active:searchOpen,messages:model.data,scrollerRef:ctrl.scrollerRef,scrollToMessage:ctrl.scrollToMessage,pauseAutoScroll:ctrl.pauseAutoScroll});
 useLayoutEffect(()=>{window.audit={ctrl,search,setActive,setPresentation,load:()=>setLoaded(true),seed:model.heightEstimateSeed,
 readState:()=>new Promise(resolve=>ctrl.virtuosoRef.current.getState(resolve)),setSearchOpen,setLoading,setHeight,setSpacer,setPermission,
 showDisclosure:()=>setSm(prev=>({...prev,content:[{type:'thinking',thinking:'Expanded thinking content with many lines. '.repeat(100),isComplete:true},{type:'text',text:'Disclosure tail.'}]})),
 growDisclosure:()=>setSm(prev=>({...prev,content:prev.content.map(block=>block.type==='text'?{...block,text:block.text+' Later output below the open content. '.repeat(20)}:block)})),append:text=>setSm(prev=>({...prev,content:prev.content+text})),replace:text=>setSm(prev=>({...prev,content:text})),snapshot:()=>{
  const el=ctrl.scrollerRef.current; const status=document.querySelector('[data-chat-status-row]');
  const er=el?.getBoundingClientRect();
  const rows=[...document.querySelectorAll('[data-message-id]')];
  const anchor=rows.find(row=>row.getBoundingClientRect().bottom>(er?.top??0));
  return {top:el?.scrollTop,height:el?.scrollHeight,viewport:el?.clientHeight,gap:el?el.scrollHeight-el.scrollTop-el.clientHeight:null,follow:ctrl.followEnabledRef.current,statusY:status?.getBoundingClientRect().top,statusH:status?.getBoundingClientRect().height,anchor:anchor?.dataset.messageId,anchorY:anchor?anchor.getBoundingClientRect().top-er.top:null};
 }}});
 return <div ref={rootRef} style={{contentVisibility:active?'visible':'hidden',height,width:760,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
 <MessageList firstItemIndex={100000} messages={model.data} streamingMessage={loaded?sm:null} isActive={active} windowPresentation={presentation} isLoading={loading} sessionState={loading?'running':'idle'} isStreaming={loading} sessionId="audit"
 heightEstimateSeed={model.heightEstimateSeed} layoutByMessageId={model.layoutByMessageId} virtuosoRef={ctrl.virtuosoRef}
 onScrollerRef={ctrl.attachScroller} followEnabledRef={ctrl.followEnabledRef} scrollToBottom={ctrl.scrollToBottom} handleAtBottomChange={ctrl.handleAtBottomChange}
 onViewportAdmissionChanged={ctrl.onViewportAdmissionChanged} onItemsRendered={onItemsRendered} isViewportRecoveryFenced={ctrl.isViewportRecoveryFenced}
 onRowLayoutChanged={ctrl.onRowLayoutChanged} bottomSpacerPx={spacer}
 pendingPermission={permission?{requestId:'fixture-permission',toolName:'Bash',input:'{"command":"pwd"}'}:null}
 onPermissionDecision={()=>setPermission(false)} />
 </div>;
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
    load(id) { if (id === entryId) return entry; },
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
const evidence=[];
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
 for(let cycle=0;cycle<5;cycle++){
  await page.evaluate(()=>window.audit.ctrl.scrollToMessage('h150',{behavior:'auto'}));
  await page.waitForTimeout(300);
  const before=await page.evaluate(()=>window.audit.snapshot());
  await page.evaluate(cycle=>{window.audit.setActive(false);window.audit.setPresentation({surfaceAvailable:false,generation:cycle+1});window.audit.setHeight(0);},cycle);
  await page.waitForTimeout(100);
  await page.evaluate(()=>window.audit.append('hidden stream '.repeat(300)));
  await page.evaluate(cycle=>{window.audit.setHeight(640);window.audit.setActive(true);window.audit.setPresentation({surfaceAvailable:true,generation:cycle+1});},cycle);
  await page.waitForTimeout(400);
  evidence.push(await page.evaluate(({cycle,before})=>({cycle,before,after:window.audit.snapshot(),fenced:window.audit.ctrl.isViewportRecoveryFenced,phase:document.querySelector('[data-viewport-phase]')?.dataset.viewportPhase}),{cycle,before}));
 }
 // Actual wheel input must take over an in-flight follow, and new output
 // must not resume it after the user releases the wheel.
 await page.evaluate(()=>window.audit.ctrl.scrollToBottom('auto'));
 await page.waitForTimeout(300);
 await page.evaluate(()=>window.audit.append('Streaming growth during follow. '.repeat(100)));
 await page.waitForTimeout(30);
 await page.mouse.move(400,300);
 await page.mouse.wheel(0,-260);
 await page.waitForTimeout(200);
 const readerStart=await page.evaluate(()=>window.audit.snapshot());
 const reading=[];
 for(let i=0;i<8;i++){
  await page.evaluate(()=>window.audit.append('New output below the reader. '.repeat(20)));
  await page.waitForTimeout(100);
  reading.push(await page.evaluate(()=>window.audit.snapshot()));
 }
 const events=await page.evaluate(()=>window.auditEvents??[]);
 const report={engine,evidence,events,errors,readerStart,reading,missingRowAnnouncements:events.filter(x=>x.missing.length>0).length};
 console.log(JSON.stringify({engine,cycles:evidence.length,missingRowAnnouncements:report.missingRowAnnouncements}));
 await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));
 await page.screenshot({path:resolve(output,'last-frame.png')});
 console.log('Evidence: '+output);
 assert.deepEqual(errors,[],'uncaught browser error');
 assert.equal(readerStart.follow,false,'wheel failed to enter reading mode');
 assert.ok(reading.every(x=>x.follow===false && Math.abs(x.top-readerStart.top)<=1),'new output resumed scrolling after wheel release');
 assert.equal(report.missingRowAnnouncements,0,'row announcement arrived before DOM commit');
 assert.ok(evidence.every(x=>!x.fenced),'restored view remained fenced');
 assert.ok(evidence.every(x=>x.phase==='renderable'),'restored view is not renderable');
 assert.ok(evidence.every(x=>x.before.anchor===x.after.anchor && Math.abs(x.before.anchorY-x.after.anchorY)<=1),'recovery moved the reading anchor');
}finally{if(browser)await browser.close();await server.close();}
