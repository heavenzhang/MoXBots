import { expect,it,vi } from 'vitest';
vi.mock('../SessionStore',()=>({getSessionMetadata:vi.fn(),getSessionData:vi.fn(),isHistoryVisibleSession:vi.fn()}));
vi.mock('../session-engine',()=>({getSessionEngine:vi.fn()}));
vi.mock('../session-text-projection',async()=>{const original=await vi.importActual<typeof import('../session-text-projection')>('../session-text-projection');return original});
import {projectRemoteInteractions,projectRemoteMessage} from './projection';
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
it('unwraps long Read results before the wire cap and marks omitted text',()=>{
  const content='line one\n'+ 'long-file-line\n'.repeat(400);
  const message=projectRemoteMessage({id:'m',role:'assistant',timestamp:'',content:JSON.stringify([{type:'tool_use',id:'t',name:'Read',tool:{status:'complete',result:JSON.stringify({type:'text',file:{filePath:'/remote/report.md',content}})}}])});
  const summary=message!.tools[0].summary;
  expect(summary).toHaveLength(2000);
  expect(message!.truncated).toBe(true);
  expect(summary).toBe(content.slice(0,1998)+'\n…');
  expect(summary).not.toContain('filePath');
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
