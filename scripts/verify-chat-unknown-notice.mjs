// Offline rendering of the real recovery panel; synthetic data, no native/model IO.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { webkit } from 'playwright';
const repo = resolve(import.meta.dirname, '..');
const output = await mkdtemp(resolve(tmpdir(), 'moxbots-unknown-notice-'));
const entryId = resolve(repo, 'src/renderer/__unknown_notice.tsx');
const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {i18n} from './i18n';
import {ThemeRuntimeProvider} from './theme/ThemeRuntime';
import {RecoveryActionReview} from './components/RecoveryActionReview';
import './index.css';
await i18n.changeLanguage('zh-CN');
const snapshot={sessionId:'fixture',sdkSessionId:'native',epoch:1,reviewAuthority:'fixture',ledgerDigest:'d',resolvedCount:0,
 unresolvedTurn:{turnId:'turn',actionHashes:['call-hash']},actions:[{actionHash:'call-hash',tool:'Bash',eligible:false,
 reason:'external_receipt_required',presentation:{kind:'command'},toolUseIds:['tool-1']}]};
window.audit={writes:0,viewed:[],failRead:false};
const inspect=async()=>{if(window.audit.failRead)throw new Error('Synthetic unavailable read');return snapshot;};
const reconcile=async()=>{window.audit.writes++;throw new Error('Read-only fixture must not reconcile');};
function Fixture(){const[expanded,setExpanded]=useState(false);const[open,setOpen]=useState(true);const[revision,setRevision]=useState(0);
 return <main style={{maxWidth:820,margin:'0 auto',padding:16}}>
 <p>独立页面验收 · 合成数据</p><h1 style={{fontSize:24}}>测试已停止</h1>
 <button onClick={()=>setExpanded(!expanded)}>{expanded?'收起执行过程':'查看执行过程'}</button>
 {expanded&&<div data-testid="process">已返回的工具步骤和原始错误记录</div>}
 <p style={{padding:'16px 0'}}>最终结果仍保留；本轮未继续执行。</p><a href="#artifact" id="artifact">测试成果.txt</a>
 {open&&<RecoveryActionReview sessionId="fixture" disabled={false} inspectRevision={String(revision)} inspect={inspect} reconcile={reconcile}
 onViewOperation={id=>{window.audit.viewed.push(id);setExpanded(true);}}/>}
 <button onClick={()=>setRevision(revision+1)}>刷新测试状态</button><button onClick={()=>setOpen(!open)}>{open?'关闭测试页面':'重新打开测试页面'}</button>
 </main>;
}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={{themeId:'proof',appearanceMode:'dark'}}><Fixture/></ThemeRuntimeProvider>);
`;
const server = await createServer({ configFile: resolve(repo, 'vite.config.ts'), cacheDir: resolve(output, 'vite-cache'),
 optimizeDeps: { exclude: ['chartjs-umd-source', 'd3-umd-source', 'lucide-umd-source', 'chartjs-umd-source?raw', 'd3-umd-source?raw', 'lucide-umd-source?raw'] },
 server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'unknown-notice-fixture', enforce: 'pre',
 resolveId(id) { if (id === '/__unknown_notice.tsx') return entryId; }, load(id) { if (id === entryId) return entry; },
 configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
 if (req.url?.split('?')[0] !== '/__unknown_notice') return next(); res.setHeader('Content-Type','text/html');
 res.end(await vite.transformIndexHtml(req.url,'<html><body style="margin:0"><div id="root"></div><script type="module" src="/__unknown_notice.tsx"></script></body></html>'));
 }); } }] });
let browser;
const evidence={synthetic:true,nativeAcceptance:false,engine:'webkit',cases:[]};
try {
 await server.listen(); browser=await webkit.launch({headless:true});
 for(const viewport of [{width:1100,height:760},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'&&r.request().method()==='GET'?r.continue():r.abort();});
  await page.goto(server.resolvedUrls.local[0]+'__unknown_notice');
  const notice=page.getByRole('region',{name:'本轮有操作的结果尚未确认'});await notice.waitFor();
  assert.equal(await page.getByTestId('process').count(),0);assert.ok(await page.getByText('测试成果.txt').isVisible());
  await page.getByRole('button',{name:'查看原操作',exact:true}).click();assert.ok(await page.getByTestId('process').isVisible());
  await page.getByRole('button',{name:'收起执行过程',exact:true}).click();assert.ok(await notice.isVisible());
  await page.getByRole('button',{name:'查看未确认结果',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('button',{name:'补充信息',exact:true}).count(),0);
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.evaluate(()=>{window.audit.failRead=true;});
  await page.getByRole('button',{name:'刷新测试状态',exact:true}).click();
  await page.getByText('暂时无法读取最新状态；这里保留上次检查发现的未确认结果。',{exact:true}).waitFor();assert.ok(await notice.isVisible());
  await page.evaluate(()=>{window.audit.failRead=false;});
  await page.getByRole('button',{name:'关闭测试页面',exact:true}).click();assert.equal(await notice.count(),0);
  await page.getByRole('button',{name:'重新打开测试页面',exact:true}).click();await notice.waitFor();
  const state=await page.evaluate(()=>({...window.audit,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(state.writes,0);assert.deepEqual(state.viewed,['tool-1']);assert.equal(state.overflow,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(output,`notice-${viewport.width}.png`),fullPage:true});
  evidence.cases.push({viewport,...state,noticeVisible:true,resultVisible:await page.getByText('测试成果.txt').isVisible(),errors});await page.close();
 }
 await writeFile(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({state:'PASS',output,...evidence}));
}finally{await browser?.close();await server.close();}
