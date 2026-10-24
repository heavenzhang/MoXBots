import { expect,it,vi } from 'vitest';
vi.mock('../SessionStore',()=>({getSessionMetadata:vi.fn(),getSessionData:vi.fn(),isHistoryVisibleSession:vi.fn()}));
vi.mock('../session-engine',()=>({getSessionEngine:vi.fn()}));
vi.mock('../session-text-projection',async()=>{const original=await vi.importActual<typeof import('../session-text-projection')>('../session-text-projection');return original});
import {buildRemoteSnapshot,projectRemoteInteractions,projectRemoteMessages} from './projection';
import { getSessionData, getSessionMetadata, isHistoryVisibleSession } from '../SessionStore';
import { getSessionEngine } from '../session-engine';
import { REMOTE_SESSION_BYTES, remoteMessageSchema } from '../../shared/remoteSession';
const projectRemoteMessage = (message: Parameters<typeof projectRemoteMessages>[0]) => projectRemoteMessages(message)[0];
it('projects actual pending approvals only and disables incomplete or secret reviews',()=>{
  const items=[{type:'permission:request',data:{requestId:'r',toolName:'Bash',input:'x'.repeat(500)}},{type:'ask-user-question:request',data:{requestId:'q',questions:[{id:'native-q',question:'Password',isSecret:true,options:[]}]}}];
  expect(projectRemoteInteractions(items,null,'turn')).toEqual([]);
  const projected=projectRemoteInteractions(items,'gen','turn');
  expect(projected).toHaveLength(2);expect(projected.every(p=>!p.actionable)).toBe(true);
  expect(projected[1].questions[0].answerKey).toBe('native-q');
  expect(projectRemoteInteractions([{type:'enter-plan-mode:request',data:{requestId:'legacy'}}],'gen','turn')).toEqual([]);
  expect(projectRemoteInteractions([{type:'permission:request',data:{requestId:'external',toolName:'apply_patch',input:'',review:{file:'/target'}}}],'gen','turn')[0].actionable).toBe(false);
});
it('does not mistake plain JSON for tool frames or leak hidden thinking and tool input',()=>{
  const base={id:'m',role:'assistant' as const,timestamp:'2026-10-15T00:00:00Z'};
  expect(projectRemoteMessage({...base,content:'[1,2]'})).toMatchObject({content:'[1,2]',tools:[]});
  const message=projectRemoteMessage({...base,content:JSON.stringify([{type:'thinking',thinking:'private reasoning'},{type:'text',text:'reply'},{type:'tool_use',id:'t',name:'Bash',input:{password:'secret',command:'private'}}])});
  expect(message).toMatchObject({content:'reply',tools:[{name:'Bash'}]});
  expect(JSON.stringify(message)).not.toMatch(/private reasoning|secret|private"/);
});
it('keeps the entire decoded long Read result reachable in bounded fragments',()=>{
  const content='line one\n'+ 'long-file-line\n'.repeat(400);
  const messages=projectRemoteMessages({id:'m',role:'assistant',timestamp:'',content:JSON.stringify([{type:'tool_use',id:'t',name:'Read',tool:{status:'complete',result:JSON.stringify({type:'text',file:{filePath:'/remote/report.md',content}})}}])});
  const tools=messages.flatMap(message=>message.tools);
  expect(tools.map(tool=>tool.summary).join('')).toBe(content);
  expect(tools.length).toBeGreaterThan(1);
  expect(messages.every(message=>message.tools.length===1)).toBe(true);
  expect(messages.every(message=>!message.truncated&&remoteMessageSchema.safeParse(message).success)).toBe(true);
  expect(JSON.stringify(messages)).not.toContain('filePath');
});
it('projects stderr and error status without sending raw parameters',()=>{
  const message=projectRemoteMessage({id:'m',role:'assistant',timestamp:'',content:JSON.stringify([{type:'tool_use',id:'t',name:'Bash',input:{command:'private command'},tool:{status:'error',result:JSON.stringify({stdout:'hello',stderr:'failed'})}}])});
  expect(message!.tools[0]).toMatchObject({status:'error',summary:'hello\n\n[stderr]\nfailed'});
  expect(JSON.stringify(message)).not.toContain('private command');
});
it('preserves running and empty outputs without invented execution details',()=>{
  const message=projectRemoteMessage({id:'m',role:'assistant',timestamp:'',content:JSON.stringify([{type:'tool_use',id:'r',name:'Read',tool:{status:'running'}},{type:'tool_use',id:'e',name:'Read',tool:{status:'complete',result:''}}])});
  expect(message!.tools).toMatchObject([{status:'running',summary:''},{status:'complete',summary:''}]);
});
it('unwraps once so JSON file contents remain verbatim',()=>{
  const content=JSON.stringify({content:'JSON document field',stdout:'JSON document stdout'});
  const message=projectRemoteMessage({id:'m',role:'assistant',timestamp:'',content:JSON.stringify([{type:'tool_use',id:'t',name:'Read',tool:{status:'complete',result:JSON.stringify({type:'text',file:{content}})}}])});
  expect(message!.tools[0].summary).toBe(content);
});

it('preserves interleaved text and every tool beyond the old ten-tool cutoff',()=>{
  const calls=Array.from({length:25},(_,i)=>({type:'tool_use',id:`tool-${i}`,tool:{name:'Read',result:`source-${i}`,status:i===24?'running':'complete'}}));
  const source={id:'ordered',role:'assistant' as const,timestamp:'',content:JSON.stringify([
    {type:'text',text:'before'},...calls.slice(0,12),{type:'text',text:'middle'},...calls.slice(12),{type:'text',text:'after'},
  ])};
  const messages=projectRemoteMessages(source);
  expect(messages.flatMap(m=>[...(m.content?[m.content]:[]),...m.tools.map(t=>t.summary)])).toEqual([
    'before',...calls.slice(0,12).map(t=>t.tool.result),'middle',...calls.slice(12).map(t=>t.tool.result),'after',
  ]);
  expect(messages.flatMap(m=>m.tools).at(-1)?.status).toBe('running');
  expect(messages.every(m=>m.tools.length<=10&&!m.truncated)).toBe(true);
  expect(new Set(messages.map(m=>m.id)).size).toBe(messages.length);
  expect(projectRemoteMessages(source)).toEqual(messages);
  const changed=projectRemoteMessages({...source,content:source.content.replace('after','after with more output')});
  expect(changed.map(m=>m.id)).toEqual(messages.map(m=>m.id));
});

it.each(['中文🙂'.repeat(12000), '\u0000'.repeat(19000)])('preserves long text within escaped UTF-8 and schema limits',content=>{
  const messages=projectRemoteMessages({id:'long-text',role:'assistant',timestamp:'',content});
  expect(messages.map(m=>m.content).join('')).toBe(content);
  expect(messages.every(m=>remoteMessageSchema.safeParse(m).success&&Buffer.byteLength(JSON.stringify(m))<32*1024)).toBe(true);
  expect(messages.every(m=>!/[\uD800-\uDBFF]$/.test(m.content)&&!m.truncated)).toBe(true);
});

it('reads every fragment through existing before-pagination without missing or duplicating content',async()=>{
  const content='中文🙂'.repeat(12000);
  const stored={id:'session',runtime:'claude-sdk',messages:[{id:'long',role:'assistant',timestamp:'',content}]};
  vi.mocked(getSessionMetadata).mockReturnValue(stored as never);
  vi.mocked(getSessionData).mockResolvedValue(stored as never);
  vi.mocked(isHistoryVisibleSession).mockReturnValue(true);
  vi.mocked(getSessionEngine).mockReturnValue({getLiveSessionOverlay:()=>({isActive:false}),getRuntimeIdentity:()=>({runtime:'claude-sdk'})} as never);
  let before: string|undefined;
  const collected=[];
  for(let page=0;page<100;page++){
    const snapshot=await buildRemoteSnapshot('agent','session',null,30,before);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(REMOTE_SESSION_BYTES);
    collected.unshift(...snapshot.messages);
    if(!snapshot.hasMoreBefore)break;
    expect(snapshot.nextBefore).not.toBe(before);
    before=snapshot.nextBefore!;
  }
  expect(collected.map(m=>m.content).join('')).toBe(content);
  expect(new Set(collected.map(m=>m.id)).size).toBe(collected.length);
});
