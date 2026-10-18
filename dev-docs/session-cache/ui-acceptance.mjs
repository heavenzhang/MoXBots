import { chromium } from 'playwright';
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
  reads.push({id,live:!!req.headers()['x-myagents-tab-id'],at:Date.now()});
  return route.fulfill({json:{success:true,session:{...meta,messages:[{id:`${id}-u`,role:'user',content:'请保留这条历史和我的草稿。',timestamp:'2026-10-19T00:00:00Z'}, {id:`${id}-a`,role:'assistant',content:`这是会话 ${id.endsWith('a')?'A':'B'} 的聊天记录，连接恢复前也可以阅读。`,timestamp:'2026-10-19T00:00:01Z'}],snapshotRevision:10,liveSessionState:'idle',hasMoreBefore:false}}});
 }
 if(p.startsWith('/api/')||p.startsWith('/agent/')||p.startsWith('/health')||p.startsWith('/skills'))return route.fulfill({json:{success:true,agents:[],skills:[],data:[],servers:[],presets:[],state:'ready'}});
 return route.continue();
});
await page.goto('http://127.0.0.1:8907/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-tab-workspace]',{timeout:180000});
await page.locator('[data-global-sidebar-workspace-row] button[data-sidebar-drag-surface]').first().press('Enter');
await page.getByText('缓存验收会话 A',{exact:true}).first().click({timeout:60000});
await page.getByText('这是会话 A 的聊天记录，连接恢复前也可以阅读。',{exact:true}).waitFor({timeout:60000});
const cold={readableBeforeConnection:await page.getByText('正在恢复连接，聊天记录可继续查看',{exact:true}).isVisible(),openStreams:await page.evaluate(()=>window.__proofStreams.filter(s=>s.readyState===0).length)};
await page.screenshot({path:`${output}/cold-history-1280.png`});
await page.evaluate(()=>window.__openProofStreams());
await page.getByText('正在恢复连接，聊天记录可继续查看',{exact:true}).waitFor({state:'hidden'});
console.log(JSON.stringify({cold,reads,errors,body:(await page.locator('body').innerText()).slice(-1200)}));
await writeFile(`${output}/ui-initial.json`,JSON.stringify({cold,reads,errors},null,2));
await browser.close();
