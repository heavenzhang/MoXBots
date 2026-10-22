// Real renderer components with synthetic transport/account fixtures only.
// Node 24: node scripts/verify-remote-session-sync.mjs [--serve]
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const repo=resolve(import.meta.dirname,'..');
const output=process.env.REMOTE_SYNC_EVIDENCE_DIR || resolve(tmpdir(),'moxbots-remote-sync-ui');
await mkdir(output,{recursive:true});
const entryId=resolve(repo,'src/renderer/__remote_sync_audit.tsx');
const entry=String.raw`
import React,{useMemo,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {i18n} from './i18n';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import {ImagePreviewProvider} from './context/ImagePreviewContext';
import {SessionDeletionContext} from './context/SessionDeletionContext';
import {ToastProvider} from './components/Toast';
import GlobalSidebar from './components/global-sidebar/GlobalSidebar';
import RemoteSession from './features/remote-session/RemoteSession';
import {applyRemoteObservation} from './features/remote-session/observation';
import {acceptNetworkRegistry,currentNetworkSnapshot} from './features/agent-network/store';
import {useTabWorkspaceController} from './tab-workspace/useTabWorkspaceController';
import {builtinTabModules} from './tab-workspace/builtinComposition';
import {serializeTabs,deserializeTabs,hydratePersistedState} from './utils/tabPersistence';
await i18n.changeLanguage('zh-CN');
window.qa={content:'我会先查看项目资料，按客户进展和下一步行动整理。',revision:1,calls:[],offline:false};
const scope={serviceId:'service',environment:'test',principalId:'p',networkId:'n',deviceId:'device',keyGeneration:2};
const locator={connectionId:'owned:qa',principalId:'p',networkId:'n',deviceId:'device',authGeneration:4};
function network(ready=true){acceptNetworkRegistry({selfhostEnabled:true,selected:'owned:qa',revision:Date.now(),connections:[{id:'owned:qa',name:'QA synthetic',official:false,url:null,removing:false,snapshot:{connectionId:'owned:qa',state:ready?'ready':'disconnected',principalId:'p',networkId:'n',authGeneration:4,revision:Date.now(),error:null}}]});}
network();
window.qaInvoke=async (command,args)=>{
 if(command==='cmd_agent_network_management'){
  const request=args.request.params.remoteSession;window.qa.calls.push(request.kind);
  await new Promise(resolve=>setTimeout(resolve,30));
  if(window.qa.offline)throw {code:'TARGET_UNAVAILABLE'};
  let data;
  if(request.kind==='capabilities')data={kind:'capabilities',version:1,agentId:'a',runtime:'builtin',maxActiveSessions:100,liveUpdates:'snapshot'};
  else if(request.kind==='get')data={kind:'snapshot',agentId:'a',sessionId:request.sessionId,generation:'generation',turnId:'turn',revision:String(window.qa.revision),title:request.sessionId==='s1'?'整理本周客户跟进':'检查应用服务状态',state:request.sessionId==='s1'?'running':'idle',runtime:'builtin',model:'远端模型',terminal:null,messages:[{id:'user',role:'user',timestamp:'2026-10-23T10:32:00+08:00',content:'帮我整理本周的客户跟进情况，先列出待处理事项。',truncated:false,tools:[]},{id:'assistant',role:'assistant',timestamp:'2026-10-23T10:32:03+08:00',content:window.qa.content,truncated:false,tools:[]}],interactions:[],hasMoreBefore:false,nextBefore:null};
  else if(request.kind==='list')data={kind:'list',agentId:'a',items:[{sessionId:'s1',title:'整理本周客户跟进',preview:'项目资料',runtime:'builtin',updatedAt:''}],hasMore:false,nextBefore:null};
  else data={kind:'receipt',agentId:'a',sessionId:request.sessionId||'s1',operationId:request.operationId,status:'accepted',code:null};
  return {scope,result:{kind:'remote-session',data}};
 }
 return null;
};
const seed=[{id:'r1',view:'remote-session',title:'整理本周客户跟进',locator,agentId:'a',agentName:'销售助手',deviceName:'Mac mini',sessionId:'s1',targetScope:scope},{id:'r2',view:'remote-session',title:'检查应用服务状态',locator,agentId:'a',agentName:'运维助手',deviceName:'Linux Host',sessionId:'s2',targetScope:scope}];
const noop=async()=>false;
function Fixture(){
 const saved=useMemo(()=>{try{const v=deserializeTabs(localStorage.getItem('remote-qa-tabs'));return v?hydratePersistedState(v):null}catch{return null}},[]);
 const {state,controller}=useTabWorkspaceController({modules:builtinTabModules,initialTabs:saved?.tabs||seed,initialActiveTabId:saved?.activeTabId||'r1',maxTabs:8,createId:()=>crypto.randomUUID(),isLastTabProtected:()=>false});
 const [local,setLocal]=useState(false);
 const binding=useMemo(()=>({onOpen:intent=>{controller.open('remote-session',intent);setLocal(false)},onOpenNetwork:()=>{network(true);window.qa.offline=false},onTarget:(id,targetScope)=>controller.update(id,'remote-session',tab=>({...tab,targetScope})),onBound:(id,sessionId,targetScope,title)=>controller.update(id,'remote-session',tab=>({...tab,sessionId,targetScope,title})),onObservation:(id,gen,observation)=>controller.update(id,'remote-session',tab=>applyRemoteObservation(tab,currentNetworkSnapshot(tab.locator.connectionId),gen,observation))}),[controller]);
 useEffect(()=>{localStorage.setItem('remote-qa-tabs',JSON.stringify(serializeTabs(state.tabs,state.activeTabId)))},[state]);
 const active=state.tabs.find(t=>t.id===state.activeTabId);
 const close=id=>{controller.removeMany([{captured:controller.capture(id)}])};
 return <><div style={{height:46,background:'#e9ede3',display:'flex',alignItems:'center',gap:20,padding:'0 20px',fontSize:12}}><strong>真实组件验收 · 模拟传输</strong><button data-testid="background" onClick={()=>{setLocal(true);window.qa.content='后台新消息：待处理事项已经整理完成。';window.qa.revision++}}>后台新消息</button><button data-testid="disconnect" onClick={()=>{window.qa.offline=true;network(false)}}>断线</button><button data-testid="reconnect" onClick={()=>{window.qa.offline=false;network(true);window.qa.content='重连后新消息：记录已经同步。';window.qa.revision++}}>恢复连接</button><button data-testid="remote-output" onClick={()=>{window.qa.content+=' 新增内容。';window.qa.revision++}}>远端追加</button></div>
 <div style={{height:'calc(100dvh - 46px)',display:'flex',background:'var(--paper)'}}>
 <GlobalSidebar tabs={state.tabs} activeTab={local?undefined:active} activeWorkspacePath={null} teamSpaceAvailable={false} onNewTab={()=>setLocal(true)} onOpenTaskCenter={()=>setLocal(true)} onCreateTask={()=>{}} onOpenSpace={()=>{}} onOpenAgentNetwork={()=>{controller.open('remote-session',{...seed[0],sessionId:undefined});setLocal(false)}} onOpenCapabilities={()=>{}} onOpenSettings={()=>{}} onOpenBugReport={()=>{}} onOpenWorkspace={noop} onOpenSession={noop} onRenameSession={async()=>null} newAgentPanelOpen={false} onNewAgentPanelOpenChange={()=>{}} onSelectRemoteTab={id=>{controller.focus(id);setLocal(false)}} onCloseRemoteTab={close}/>
 <div style={{flex:1,minWidth:0,position:'relative',display:'flex',flexDirection:'column'}}>
 <div style={{height:46,borderBottom:'1px solid var(--line)',display:'flex',alignItems:'center',padding:'0 26px',fontWeight:500}}>{local?'项目资料整理':active?.title}</div>
 <div style={{flex:1,minHeight:0,position:'relative'}}>{local&&<div style={{padding:48}}>本地工作区 · 后台远程会话继续同步</div>}{state.tabs.filter(t=>t.view==='remote-session').map(tab=><div key={tab.id} style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',visibility:!local&&active?.id===tab.id?'visible':'hidden'}}><RemoteSession tab={tab} isActive={!local&&active?.id===tab.id} binding={binding}/></div>)}</div>
 </div></div></>;
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={{themeId:'sage',appearanceMode:'light'}}><ImagePreviewProvider><ToastProvider><SessionDeletionContext.Provider value={async()=>({deleted:false})}><Fixture/></SessionDeletionContext.Provider></ToastProvider></ImagePreviewProvider></ThemeRuntimeProvider>);
`;
const configStub=`const config={agents:[],defaultWorkspacePath:null};const projects=[];const noop=async()=>{};export const data={config,projects,providers:[],apiKeys:{},isLoading:false,error:null,managedCodexRuntimeUpdateInFlight:false,refreshConfig:noop,touchProject:noop,patchProject:noop,removeProject:noop,addProject:noop};export function useConfig(){return data}export function useConfigData(){return data}`;
const taskStub=`const data={sessions:[],isSessionsLoading:false,error:null,sessionTagsMap:new Map(),workspaceSessionStates:new Map(),deleteProtectedSessionIds:new Set(),refresh:()=>{},actions:{refreshSessions:()=>{},setSessionFavorite:async()=>true,beginSessionMetadataMutation:()=>1,applySessionMetadata:()=>true}};export function useGlobalSidebarTaskCenterData(){return data}export function useTaskCenterData(){return data}export function useWorkspaceTaskCenterData(){return data}`;
const notificationStub=`const value={snapshot:{loadState:'ready',authState:'signed_out',items:[],hasUnread:false,hasMore:false,isLoadingMore:false,feedCutoff:null,lastSyncedAt:null,errorCode:null},refresh:()=>{},loadMore:async()=>{},markAllRead:async()=>{}};export function useNotificationCenter(){return value}`;
const server=await createServer({configFile:resolve(repo,'vite.config.ts'),cacheDir:resolve(output,'node_modules/.vite'),define:{__MYAGENTS_BUILD_PROFILE__:JSON.stringify('moxbot')},optimizeDeps:{exclude:['@tauri-apps/api/core','chartjs-umd-source','d3-umd-source','lucide-umd-source','chartjs-umd-source?raw','d3-umd-source?raw','lucide-umd-source?raw']},server:{host:'127.0.0.1',port:44183,strictPort:true},plugins:[{
 name:'remote-sync-qa',enforce:'pre',resolveId(id){if(id==='/__remote_sync_audit.tsx')return entryId},
 transform(code,id){if(id.includes('/@tauri-apps/api/core.js'))return code.replace('return window.__TAURI_INTERNALS__.invoke(cmd, args, options);','return window.qaInvoke(cmd,args);')},
 async load(id){
  if(id===entryId)return entry;
  if(id===resolve(repo,'src/renderer/hooks/useConfig.ts')||id===resolve(repo,'src/renderer/config/useConfigData.ts'))return configStub;
  if(id===resolve(repo,'src/renderer/hooks/useTaskCenterData.ts'))return taskStub;
  if(id===resolve(repo,'src/renderer/notifications/useNotificationCenter.ts'))return notificationStub;
  if(id===resolve(repo,'src/renderer/features/account/AccountEntry.tsx')||id===resolve(repo,'src/renderer/features/account/OwnedAccountEntry.tsx'))return 'export default function Entry(){return null}';
  if(id.endsWith('/@tauri-apps/api/core.js'))return (await readFile(id,'utf8')).replace('return window.__TAURI_INTERNALS__.invoke(cmd, args, options);','return window.qaInvoke(cmd,args);');
 },configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__remote_sync_audit')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remote sync component acceptance</title><style>body{margin:0}button{cursor:pointer}</style></head><body><div id="root"></div><script type="module" src="/__remote_sync_audit.tsx"></script></body></html>'))})}
}]});
await server.listen();
const url='http://127.0.0.1:44183/__remote_sync_audit';
console.log(url);
if(process.argv.includes('--serve')){await new Promise(()=>{});}else{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];const checks=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('Renderer error:',e.message)});
 const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name)};
 try{
  await page.goto(url);await page.getByText('我会先查看项目资料，按客户进展和下一步行动整理。',{exact:true}).first().waitFor();
  await page.screenshot({path:resolve(output,'desktop.png')});
  await page.getByTestId('background').click();
  await page.getByLabel('有新消息',{exact:true}).first().waitFor({timeout:8000});
  check('background activity appears without taking focus',await page.getByText('本地工作区 · 后台远程会话继续同步').isVisible());
  await page.getByRole('button',{name:/整理本周客户跟进 · 销售助手/}).click();
  await page.getByText('后台新消息：待处理事项已经整理完成。',{exact:true}).waitFor();
  check('sidebar returns to original session and clears unread',await page.locator('[aria-current="page"]').count()===1);
  await page.getByRole('textbox').fill('保留这条草稿');await page.getByTestId('disconnect').click();
  check('offline keeps draft and disables sending',await page.getByRole('textbox').inputValue()==='保留这条草稿'&&!await page.getByRole('button',{name:'发送',exact:true}).isEnabled());
  await page.screenshot({path:resolve(output,'offline.png')});
  await page.getByTestId('reconnect').click();await page.getByText('重连后新消息：记录已经同步。',{exact:true}).waitFor();
  check('reconnect refreshes original session without losing draft',await page.getByRole('textbox').inputValue()==='保留这条草稿');
  await page.setViewportSize({width:900,height:760});await page.getByRole('button',{name:'Agent 工作区',exact:true}).click();
  await page.getByRole('button',{name:/整理本周客户跟进 · 销售助手/}).waitFor();
  const close=page.getByRole('button',{name:'关闭远程会话：检查应用服务状态',exact:true});
  const row=page.locator('[data-remote-session-sidebar] li').filter({has:close});
  await row.hover();
  const rowBox=await row.boundingBox(),closeBox=await close.boundingBox();
  check('compact close control stays inside the row at the upper right',rowBox&&closeBox&&closeBox.x>rowBox.x+rowBox.width/2&&closeBox.x+closeBox.width<=rowBox.x+rowBox.width&&closeBox.y>=rowBox.y&&closeBox.y+closeBox.height<=rowBox.y+rowBox.height);
  await page.screenshot({path:resolve(output,'compact-flyout.png')});
  check('compact layout exposes remote sessions in existing flyout',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await close.click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('remote-qa-tabs')).tabs.length===1);
  await page.keyboard.press('Escape');await page.reload();await page.getByRole('textbox').first().waitFor();
  await page.getByRole('button',{name:'Agent 工作区',exact:true}).click();
  check('actual restore retains original entry and keeps closed entry removed',await page.locator('[data-remote-session-sidebar] li').count()===1);
  check('observation never sends a remote mutation',await page.evaluate(()=>window.qa.calls.every(x=>['get','list','capabilities','receipt'].includes(x))));
  check('no renderer errors',errors.length===0);
  await writeFile(resolve(output,'checks.json'),JSON.stringify({url,checks,errors,scope:'Actual renderer components; synthetic account and transport only'},null,2));console.log(JSON.stringify({passed:checks.length,errors,output}));
 }finally{await browser.close();await server.close()}
}
