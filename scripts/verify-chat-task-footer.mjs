// Offline regression for the real completed-task footer's scroll geometry.
// node scripts/verify-chat-task-footer.mjs webkit (or chromium)
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
import { patchReactVirtuoso } from './patch-react-virtuoso.mjs';

const repo = resolve(import.meta.dirname, '..');
patchReactVirtuoso(resolve(repo, 'node_modules/react-virtuoso'), true);
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-task-footer-'));
const engine = process.argv[2] ?? 'webkit';
assert.ok(['webkit', 'chromium'].includes(engine));
const entryId = resolve(repo, 'src/renderer/__task_footer_audit.tsx');
const entry = `
import React,{useState,useRef,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import {ImagePreviewProvider} from './context/ImagePreviewContext';
import {TabContext} from './context/TabContext';
import {i18n} from './i18n';
import MessageList from './components/MessageList';
import SessionTaskResults from './components/agent-status/SessionTaskResults';
import {SessionTaskActionsContext} from './components/agent-status/SessionTaskActionsContext';
import {SessionTaskOrchestrationProvider} from './components/agent-status/useSessionTaskOrchestration';
import {useChatScrollModel} from './hooks/useChatScrollModel';
import {useChatScrollController} from './hooks/useChatScrollController';
import './index.css';
await i18n.changeLanguage('zh-CN');
const history=Array.from({length:80},(_,i)=>({id:'history-'+i,role:i%3?'assistant':'user',timestamp:new Date(0),
 content:i===79?'## Completed report\\n\\n'+Array(30).fill('A final paragraph with stable content and no active execution.').join('\\n\\n'):'Historical paragraph with stable wrapping. '.repeat(25)}));
const tasks=Array.from({length:6},(_,i)=>({id:'task-'+i,title:'Completed task '+i,blockedBy:[]}));
const ledger={revision:1,tasks,bindings:{},attempts:[],reviews:tasks.map(task=>({taskId:task.id,attemptId:'main',decision:'accept',evidence:'Synthetic acceptance'}))};
const reads=[];
const apiGet=async path=>{reads.push(path);return {success:true,sessionId:'fixture',ledger}};
const actions={disabled:true,onInspect:()=>{},onComposeRework:()=>{},onReview:async()=>{throw Error('No business writes in this fixture')}};
const footer=<SessionTaskResults/>;
const presentation={surfaceAvailable:true,generation:1};
function Fixture(){
 const [active,setActive]=useState(true),[showFooter,setShowFooter]=useState(true),[spacer,setSpacer]=useState(185);
 const [messages,setMessages]=useState(history);
 const rootRef=useRef(null);
 const model=useChatScrollModel({historyMessages:messages,streamingMessage:null,sessionId:'fixture'});
 const ctrl=useChatScrollController({messages:model.data,isActive:active,sessionId:'fixture',rootRef,windowPresentation:presentation});
 useLayoutEffect(()=>{window.audit={ctrl,setActive,setShowFooter,setSpacer,reads,setTail:content=>setMessages(previous=>previous.map((message,index)=>index===79?{...message,content}:message)),snapshot:()=>{
  const s=ctrl.scrollerRef.current,l=s?.querySelector('[data-testid=virtuoso-item-list]'),f=l?.nextElementSibling,v=l?.parentElement;
  const natural=f?f.getBoundingClientRect().bottom-v.getBoundingClientRect().top:null;
  return {top:s?.scrollTop,height:s?.scrollHeight,view:s?.clientHeight,gap:s?s.scrollHeight-s.clientHeight-s.scrollTop:null,
   follow:ctrl.followEnabledRef.current,natural,extent:v?.querySelector('[data-virtuoso-scroll-extent]')?.getBoundingClientRect().height,
   footerHeight:f?.getBoundingClientRect().height,firstMargin:f?.firstElementChild?.firstElementChild?getComputedStyle(f.firstElementChild.firstElementChild).marginTop:null,
   tailY:s?.querySelector('[data-message-id="history-79"]')?.getBoundingClientRect().top,
   tailMounted:!!s?.querySelector('[data-message-id="history-79"]')};
 }}});
 return <TabContext.Provider value={{tabId:'fixture',sessionId:'fixture',sessionState:'idle',isLoading:false,isSessionLoading:false,
  messages:model.data,streamingMessage:null,agentPlanTodos:null,apiGet}}>
 <SessionTaskOrchestrationProvider><SessionTaskActionsContext.Provider value={actions}>
 <div ref={rootRef} style={{height:749,width:1060,position:'relative',display:'flex',flexDirection:'column',overflow:'hidden'}}>
 <MessageList messages={model.data} streamingMessage={null} isLoading={false} sessionState="idle" isStreaming={false} sessionId="fixture"
 firstItemIndex={1000000} heightEstimateSeed={model.heightEstimateSeed} layoutByMessageId={model.layoutByMessageId}
 isActive={active} windowPresentation={presentation} footerContent={showFooter?footer:null} bottomSpacerPx={spacer}
 virtuosoRef={ctrl.virtuosoRef} onScrollerRef={ctrl.attachScroller} followEnabledRef={ctrl.followEnabledRef}
 scrollToBottom={ctrl.scrollToBottom} handleAtBottomChange={ctrl.handleAtBottomChange}
 onViewportAdmissionChanged={ctrl.onViewportAdmissionChanged} onItemsRendered={ctrl.onItemsRendered}
 isViewportRecoveryFenced={ctrl.isViewportRecoveryFenced} onRowLayoutChanged={ctrl.onRowLayoutChanged}/>
 </div></SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider></TabContext.Provider>;
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={{themeId:'proof',appearanceMode:'dark'}}><ImagePreviewProvider><Fixture/></ImagePreviewProvider></ThemeRuntimeProvider>);
`;
const server = await createServer({
  configFile: resolve(repo, 'vite.config.ts'), cacheDir: resolve(output, 'vite-cache'),
  optimizeDeps: { exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source',
    'chartjs-umd-source?raw', 'd3-umd-source?raw', 'lucide-umd-source?raw'] },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'task-footer-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__task_footer_audit.tsx') return entryId; },
    load(id) { if (id === entryId) return entry; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/__task_footer_audit') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<html><body style="margin:0"><div id="root"></div><script type="module" src="/__task_footer_audit.tsx"></script></body></html>'));
      });
    },
  }],
});
let browser;
let page;
const evidence = {};
try {
  await server.listen();
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' && process.env.MOXBOTS_SCROLL_CHROMIUM_PATH
      ? { executablePath: process.env.MOXBOTS_SCROLL_CHROMIUM_PATH } : {}),
  });
  page = await browser.newPage({ viewport: { width: 1200, height: 850 }, recordVideo: { dir: output } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Hold only the real list's native size delivery. React can commit taller
  // content before ResizeObserver updates Virtuoso's size tree; following must
  // not navigate past that tree and unmount the very row awaiting measurement.
  await page.addInitScript(() => {
    window.nativeScrollWrites = 0;
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      window.nativeScrollWrites++;
      return scrollTo.apply(this, args);
    };
    const NativeObserver = window.ResizeObserver;
    const pending = new Map();
    window.measurements = {
      held: false,
      get pendingCount() { return pending.size; },
      flush() {
        this.held = false;
        const deliveries = [...pending.values()];
        pending.clear();
        deliveries.forEach(({ callback, entries, observer }) => callback(entries, observer));
      },
    };
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback) {
        super((entries, observer) => {
          if (window.measurements.held && entries.some(entry => entry.target.matches('[data-testid="virtuoso-item-list"]'))) {
            pending.set(observer, { callback, entries, observer });
          } else callback(entries, observer);
        });
      }
      disconnect() { pending.delete(this); super.disconnect(); }
    };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && route.request().method() === 'GET'
      ? route.continue() : route.abort();
  });
  await page.goto(server.resolvedUrls.local[0] + '__task_footer_audit');
  await page.getByText('主 Agent 任务 6 项', { exact: false }).waitFor();
  const geometry = async label => {
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => window.audit.snapshot());
    evidence[label] = state;
    await writeFile(resolve(output, 'geometry.json'), JSON.stringify(evidence, null, 2));
    assert.ok(Math.abs(state.natural - state.extent) < 0.05,
      label + ': task footer escapes measured extent: ' + JSON.stringify(state));
    assert.equal(state.height, Math.ceil(state.natural), label + ': native and natural overflow differ');
    assert.ok(Math.abs(state.gap) <= 1, label + ': following left a bottom gap');
    return state;
  };
  await geometry('cold');
  await page.locator('summary').click();
  await geometry('expanded');
  await page.locator('summary').click();
  await geometry('collapsed');
  await page.evaluate(() => window.audit.setSpacer(216.375));
  await geometry('fractional-spacer');
  await page.evaluate(() => window.audit.setShowFooter(false));
  await geometry('without-tasks');
  await page.evaluate(() => window.audit.setShowFooter(true));
  await geometry('tasks-restored');
  evidence.pendingMeasurement = await page.evaluate(async () => {
    window.measurements.held = true;
    window.audit.setTail(Array(250).fill('New tall output awaiting native measurement.').join('\n\n'));
    const frames = [];
    for (let i = 0; i < 8; i++) {
      await new Promise(requestAnimationFrame);
      frames.push({ ...window.audit.snapshot(), pendingCount: window.measurements.pendingCount });
    }
    window.measurements.flush();
    return frames;
  });
  assert.ok(evidence.pendingMeasurement.some(frame => frame.pendingCount > 0),
    'native list measurement delivery was not delayed');
  assert.ok(evidence.pendingMeasurement.every(frame => frame.tailMounted),
    'following unmounted the tall row before its pending measurement could be delivered');
  assert.ok(evidence.pendingMeasurement.every(frame => frame.top <= Math.max(0, frame.extent - frame.view) + 1),
    'following navigated beyond the virtualizer extent before measurement');
  await geometry('tall-measured');
  await page.evaluate(() => window.audit.setTail('Short final output after the tall row shrinks.'));
  await geometry('tail-shrunk');
  // Native restoration admits a previously skipped list, then pins through the
  // existing index/motion owners. It must use the same bottom as the footer.
  await page.evaluate(() => window.audit.setActive(false));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.audit.setActive(true));
  await geometry('readmitted');
  const idle = await page.evaluate(async () => {
    window.nativeScrollWrites = 0;
    const frames = [], until = performance.now() + 6500;
    while (performance.now() < until) {
      await new Promise(requestAnimationFrame);
      frames.push(window.audit.snapshot());
    }
    return frames;
  });
  evidence.idle = idle;
  evidence.idleScrollWrites = await page.evaluate(() => window.nativeScrollWrites);
  assert.equal(evidence.idleScrollWrites, 0, 'settled task refresh caused redundant scroll writes');
  assert.equal(new Set(idle.map(frame => frame.top)).size, 1, 'idle task snapshot refresh moved the chat');
  assert.equal(new Set(idle.map(frame => frame.height)).size, 1, 'idle task snapshot refresh changed overflow');
  assert.ok(idle.every(frame => Math.abs(frame.natural - frame.extent) < 0.05));
  await page.mouse.move(500, 250);
  await page.mouse.wheel(0, -350);
  await page.waitForTimeout(300);
  const reading = await page.evaluate(() => window.audit.snapshot());
  assert.equal(reading.follow, false);
  await page.evaluate(() => window.audit.setSpacer(250));
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => window.audit.snapshot());
  evidence.reading = { before: reading, after };
  assert.equal(after.follow, false);
  assert.ok(Math.abs(after.top - reading.top) <= 1, 'footer resize took over user reading');
  await page.evaluate(() => window.audit.ctrl.scrollToBottom('auto'));
  await geometry('explicit-bottom');
  assert.ok((await page.evaluate(() => window.audit.reads.length)) >= 3, 'task snapshot refresh was not exercised');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(output, 'task-footer.png') });
  console.log('Task footer ' + engine + ': measured extent, expansion, restoration, idle refresh and reading passed. Evidence: ' + output);
} finally {
  await writeFile(resolve(output, 'geometry.json'), JSON.stringify(evidence, null, 2));
  await page?.screenshot({ path: resolve(output, 'last-frame.png') }).catch(() => {});
  await browser?.close();
  await server.close();
  console.log('Task footer evidence: ' + output);
}
