import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { readSessionHistoryTail } from '../../src/server/session-history-tail.ts';
const root=await mkdtemp(join(tmpdir(),'moxbots-history-bench-'));
try {
 const rows=Array.from({length:1024},(_,index)=>({id:String(index),role:'assistant',content:'中文正文及工具结果😀'.repeat(2400),timestamp:'t'}));
 const path=join(root,'session.jsonl');
 const wire=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
 await writeFile(path,wire);
 const baseline=[],tail=[];
 for(let i=0;i<3;i++){
  let t=performance.now();
  const all=(await readFile(path,'utf8')).split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line));
  const oldPage=all.slice(-80); baseline.push(performance.now()-t);
  t=performance.now(); const latest=await readSessionHistoryTail(path,20); tail.push(performance.now()-t);
  assert.deepEqual(latest,oldPage.slice(-20));
 }
 const median=values=>[...values].sort((a,b)=>a-b)[1];
 const result={scope:'synthetic warm-filesystem V1 read+parse; excludes transport/renderer/provider',bytes:Buffer.byteLength(wire),rows:rows.length,baseline:{page:80,ms:baseline,medianMs:median(baseline)},tail:{page:20,ms:tail,medianMs:median(tail)},ratio:median(baseline)/median(tail),equalNewest20:true};
 console.log(JSON.stringify(result,null,2));
 if(process.env.HISTORY_BENCH_OUTPUT)await writeFile(process.env.HISTORY_BENCH_OUTPUT,JSON.stringify(result,null,2));
}finally{await rm(root,{recursive:true,force:true});}
