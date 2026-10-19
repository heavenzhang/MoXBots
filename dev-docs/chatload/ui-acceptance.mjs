import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const output = process.env.SESSION_CACHE_OUTPUT;
const browser = await chromium.launch({headless:true,executablePath:process.env.SESSION_CACHE_CHROMIUM});
const context = await browser.newContext({viewport:{width:1280,height:800}});
const page = await context.newPage();
const errors=[]; page.on('console', message=>{if(message.type()==='error')console.log('BROWSER_ERROR', message.text());}); page.on('pageerror', e=>errors.push(e.message));
const sessions = ['a','b'].map((suffix,i)=>({id:`cache-proof-${suffix}`,agentDir:'/tmp/session-cache-proof',title:`缓存验收会话 ${suffix.toUpperCase()}`,runtime:'builtin',createdAt:'2026-10-19T00:00:00Z',lastActiveAt:`2026-10-19T00:00:0${i}Z`}));
const reads=[];
await context.addInitScript(()=>{
 localStorage.setItem('myagents:projects', JSON.stringify([{id:'cache-proof-project',path:'/tmp/session-cache-proof',displayName:'会话缓存验收',createdAt:1,lastOpened:1}]));
 localStorage.setItem('myagents:config', JSON.stringify({uiLanguage:'zh-CN',themeId:'myagents-default',appearanceMode:'light',providers:[],mcpServers:[],agents:[],hasCompletedOnboarding:true,liteLLMModelDataRefresh:false}));
 window.__proofStreams=[];
 class ProofEventSource extends EventTarget {
  static CONNECTING=0;static OPEN=1;static CLOSED=2;
  readyState=0;onopen=null;onerror=null;url;
  constructor(url){super();this.url=String(url);window.__proofStreams.push(this);}
  close(){this.readyState=2;}
 }
 window.EventSource=ProofEventSource;
 window.__openProofStreams=()=>{for(const stream of window.__proofStreams){if(stream.readyState===0){stream.readyState=1;stream.onopen?.(new Event('open'));}}};
});
await context.route('**/*',async route=>{
 const req=route.request();const u=new URL(req.url());
 if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();
 if(['script','stylesheet','image','font'].includes(req.resourceType()))return route.continue();
 const p=u.pathname;
 if(p.startsWith('/sessions')){
  const id=p.split('/')[2];
  if(!id)return route.fulfill({json:{success:true,sessions}});
  const meta=sessions.find(s=>s.id===id);
  reads.push({id,live:!!req.headers()['x-myagents-tab-id'],limit:u.searchParams.get('limit'),view:u.searchParams.get('view'),at:Date.now()});
  const all=[{id:`${id}-u`,role:'user',content:'请保留这条历史和我的草稿。',timestamp:'2026-10-19T00:00:00Z'},
    ...Array.from({length:99},(_,i)=>({id:`${id}-row-${i}`,role:'assistant',content:i===98?`这是会话 ${id.endsWith('a')?'A':'B'} 的聊天记录，连接恢复前也可以阅读。`:`第 ${i+1} 段历史：核对记录、执行结果和下一步。\n\n保留原会话的阅读位置与未发送草稿。`,timestamp:'2026-10-19T00:00:01Z'}))];
  const limit=u.searchParams.get('view')==='history'?20:Number(u.searchParams.get('limit')||80);
  const before=u.searchParams.get('before');
  const end=before?all.findIndex(row=>row.id===before):all.length;
  const begin=Math.max(0,end-limit);
  return route.fulfill({json:{success:true,session:{...meta,messages:all.slice(begin,end),snapshotRevision:10,liveSessionState:'idle',hasMoreBefore:begin>0,totalCount:all.length}}});
 }
 if(p.startsWith('/api/')||p.startsWith('/agent/')||p.startsWith('/health')||p.startsWith('/skills'))return route.fulfill({json:{success:true,agents:[],skills:[],data:[],servers:[],presets:[],state:'ready'}});
 return route.continue();
});
await page.goto('http://127.0.0.1:8919/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-tab-workspace]',{timeout:180000});
await page.locator('[data-global-sidebar-workspace-row] button[data-sidebar-drag-surface]').first().press('Enter');
await page.getByText('缓存验收会话 A',{exact:true}).first().click({timeout:60000});
await page.getByText('这是会话 A 的聊天记录，连接恢复前也可以阅读。',{exact:true}).waitFor({timeout:60000});
const cold={readableBeforeConnection:await page.getByText('正在恢复连接，聊天记录可继续查看',{exact:true}).isVisible(),openStreams:await page.evaluate(()=>window.__proofStreams.filter(s=>s.readyState===0).length)};
await page.screenshot({path:`${output}/cold-history-1280.png`});
await page.evaluate(()=>window.__openProofStreams());
await page.getByText('正在恢复连接，聊天记录可继续查看',{exact:true}).waitFor({state:'hidden'});
assert.equal(cold.readableBeforeConnection,true);
assert.ok(cold.openStreams>0);
const activeA = page.locator('[data-cached-page-view="chat"]').filter({has:page.getByText('这是会话 A 的聊天记录，连接恢复前也可以阅读。',{exact:true})});
const aId=await activeA.getAttribute('data-cached-page-id');
const a=page.locator(`[data-cached-page-id="${aId}"]`);
await a.locator('textarea').fill('这是一条切换后必须保留的草稿。');
const scroller=a.locator('[data-virtuoso-scroller="true"]');
await scroller.hover(); await page.mouse.wheel(0,-600);
await page.waitForTimeout(500);
const scrollBefore=await scroller.evaluate(el=>el.scrollTop);
const historyReadsBefore=reads.filter(r=>r.id==='cache-proof-a'&&(r.view==='history'||r.limit==='80')).length;
const streamsBefore=await page.evaluate(()=>window.__proofStreams.length);
await page.locator('[data-global-sidebar-session-row] button[data-sidebar-drag-surface]').filter({hasText:'缓存验收会话 B'}).press('Enter');
await page.getByText('这是会话 B 的聊天记录，连接恢复前也可以阅读。',{exact:true}).waitFor();
await page.evaluate(()=>window.__openProofStreams());
await page.getByText('正在恢复连接，聊天记录可继续查看',{exact:true}).waitFor({state:'hidden'});
const streamsAfterB=await page.evaluate(()=>window.__proofStreams.length);
await page.locator('[data-global-sidebar-session-row] button[data-sidebar-drag-surface]').filter({hasText:'缓存验收会话 A'}).press('Enter');
await a.locator('textarea').waitFor({state:'visible'});
assert.equal(await a.locator('textarea').inputValue(),'这是一条切换后必须保留的草稿。');
await page.waitForTimeout(500);
const scrollAfter=await scroller.evaluate(el=>el.scrollTop);
assert.ok(Math.abs(scrollBefore-scrollAfter)<=2,`reading position changed: ${scrollBefore} -> ${scrollAfter}`);
assert.equal(reads.filter(r=>r.id==='cache-proof-a'&&(r.view==='history'||r.limit==='80')).length,historyReadsBefore);
assert.equal(await page.evaluate(()=>window.__proofStreams.length),streamsAfterB);
assert.equal(await a.locator('[aria-hidden="false"]').filter({hasText:'正在加载聊天记录'}).count(),0);
await page.screenshot({path:`${output}/warm-cache-draft-1280.png`});
await page.setViewportSize({width:800,height:600});
await a.locator('textarea').waitFor({state:'visible'});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
assert.equal(overflow,false);
await page.screenshot({path:`${output}/warm-cache-draft-800.png`});
assert.deepEqual(errors,[]);
const evidence={cold,warm:{aId,historyReadsBefore,historyReadsAfter:reads.filter(r=>r.id==='cache-proof-a'&&(r.view==='history'||r.limit==='80')).length,streamsBefore,streamsAfterB,scrollBefore,scrollAfter,draftPreserved:true},responsive:{width:800,overflow},reads,errors};
console.log(JSON.stringify(evidence));
await writeFile(`${output}/ui-evidence.json`,JSON.stringify(evidence,null,2));
await browser.close();
