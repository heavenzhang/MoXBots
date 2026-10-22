// Offline real-component regression; no live Session or business action.
// Usage: node scripts/verify-session-continuation.mjs
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { webkit } from 'playwright';
const repo = resolve(import.meta.dirname, '..');
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-continuation-'));
const entryId = repo + '/src/renderer/__continuation_audit.tsx';
const entry = `import React,{useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {i18n} from './i18n';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import './index.css';
import {SessionContinuationBanner} from './components/SessionContinuationBanner';
import {deriveSessionContinuation,matchesSessionContinuation} from '../shared/sessionContinuation';
import {createTranscriptProjection} from '../shared/sessionTranscript';
await i18n.changeLanguage('zh-CN');
let calls=0,resolvePending;
function Fixture(){
 const [stage,setStage]=useState('active');
 const projection=createTranscriptProjection();
 projection.messages.set('u1',{id:'u1',role:'user',content:'Synthetic first request',timestamp:'t'});
 const status=stage==='active'?'running':stage==='completed'?'complete':stage==='stopped'?'stopped':'interrupted';
 projection.turns.set('t1',{id:'t1',rootUserMessageId:'u1',startedAt:'t',status});
 const metadata=stage==='legacy-running'?{turnId:'t1',rootUserMessageId:'u1',status:'running'}:deriveSessionContinuation(projection);
 const continuation=matchesSessionContinuation(metadata,[...projection.messages.values()])?metadata:undefined;
 useLayoutEffect(()=>{window.audit={choose:setStage,calls:()=>calls,release:value=>resolvePending?.(value)}});
 return <main style={{maxWidth:1000,margin:'20px auto'}}><h1>当前会话</h1>
 <SessionContinuationBanner key={stage} sessionId="fixture" turnId={continuation?.turnId} ready={stage!=='hydrating'} blocked={stage==='active'||stage==='blocked'}
 onContinue={()=>{calls++;return new Promise(resolve=>{resolvePending=resolve})}} onUnavailable={()=>{throw Error('unexpected unavailable')}}/>
 <p data-testid="body">{stage==='active'?'新会话正在处理首条请求':'原会话内容和草稿保持在此'}</p><textarea aria-label="草稿" defaultValue="保留的草稿"/></main>;
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={null}><Fixture/></ThemeRuntimeProvider>);`;
const server=await createServer({configFile:resolve(repo,'vite.config.ts'),cacheDir:resolve(output,'vite-cache'),server:{host:'127.0.0.1',port:0},plugins:[{
 name:'continuation-audit',enforce:'pre',resolveId:id=>id==='/__continuation_audit.tsx'?entryId:undefined,load:id=>id===entryId?entry:undefined,
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__continuation_audit')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><head><style>body{margin:0;padding:12px;background:#faf9f5;color:#303330;font:16px Arial}textarea{border:1px solid #aaa}</style></head><body><div id="root"></div><script type="module" src="/__continuation_audit.tsx"></script></body></html>'));});}
}]});
let browser;
const errors=[],evidence=[];
try{
 await server.listen();browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:700}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__continuation_audit');
 await page.waitForFunction(()=>window.audit);
 const banner=page.getByRole('button',{name:'继续未完成任务'});
 for(const stage of ['active','completed','hydrating','blocked','legacy-running']){
  await page.evaluate(stage=>window.audit.choose(stage),stage);
  await page.waitForTimeout(40);
  assert.equal(await banner.count(),0,stage+' must not advertise continuation');
  assert.equal(await page.getByText('任务尚未完成',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.audit.calls()),0);
  evidence.push({stage,banner:false,automaticCalls:0});
 }
 await page.evaluate(()=>window.audit.choose('active'));await page.waitForTimeout(40);
 await page.screenshot({path:resolve(output,'fresh-running.png')});
 for(const width of [1200,620]){
  await page.setViewportSize({width,height:700});
  for(const stage of ['stopped','restored']){
   await page.evaluate(stage=>window.audit.choose(stage),stage);
   await banner.waitFor({state:'visible'});assert.equal(await banner.isEnabled(),true);
   assert.equal(await page.getByRole('textbox',{name:'草稿'}).inputValue(),'保留的草稿');
   const bounds=await banner.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
   evidence.push({stage,width,banner:true,enabled:true,visibleWithinViewport:true});
  }
  await page.screenshot({path:resolve(output,'interrupted-'+width+'.png')});
 }
 await banner.click();await banner.click({force:true});
 assert.equal(await page.evaluate(()=>window.audit.calls()),1,'duplicate click dispatched twice');
 await page.evaluate(()=>window.audit.release(false));
 await page.waitForFunction(()=>!document.querySelector('button')?.disabled);
 await banner.click();assert.equal(await page.evaluate(()=>window.audit.calls()),2);
 await page.evaluate(()=>window.audit.release(true));
 await banner.waitFor({state:'hidden'});
 assert.equal(await page.getByRole('textbox',{name:'草稿'}).inputValue(),'保留的草稿');
 assert.deepEqual(errors,[]);
 const result={pass:true,engine:'webkit',evidence,calls:2,duplicatePendingBlocked:true,rejectedRetryAllowed:true,acceptedHidden:true,draftPreserved:true,errors,scope:'offline real domain projection and real banner; synthetic data; not native production acceptance'};
 await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({output,...result}));
}finally{if(browser)await browser.close();await server.close();}
