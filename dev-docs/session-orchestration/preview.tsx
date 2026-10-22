// Synthetic acceptance surface using production components; no business writes.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import ExecutionStatusBar from '../../src/renderer/components/agent-status/ExecutionStatusBar';
import SubagentInspector from '../../src/renderer/components/agent-status/SubagentInspector';
import { applySessionTaskAction as apply, emptyTaskLedger, mergeTaskObservations as observe, type SessionTaskLedger } from '../../src/shared/sessionTaskOrchestration';
import type { Message } from '../../src/renderer/types/chat';
const start = Date.now() - 10000;
const work = { id: 'child:run-1', toolUseId: 'child', agentId: 'reviewer', title: '核查接口权限并验证回归', executionVerified: true, lifecycle: { status: 'running' as const, startedAt: start, activation: { id: 'run-1', ordinal: 1, state: 'running' as const }, description: '核查接口权限并验证回归' } };
function initial() {
 let state = apply(emptyTaskLedger(), {kind:'ensure',taskId:'api-repair',title:'修复接口权限并完成回归验收',expectedRevision:0});
 state = observe(state,[work]);
 return apply(state,{kind:'bind',taskId:'api-repair',toolUseId:'child',expectedRevision:state.revision});
}
function Preview() {
 const [ledger,setLedger] = useState<SessionTaskLedger>(initial), [dark,setDark] = useState(false), [offline,setOffline] = useState(false), [session,setSession] = useState('synthetic-session'), [selected,setSelected] = useState<string|null>(null), [note,setNote] = useState(''), [disconnected,setDisconnected] = useState<SessionTaskLedger|null>(null);
 const ref = useRef({ledger,offline,session}); ref.current={ledger,offline,session};
 const apiGet = useRef(async () => { if(ref.current.offline) throw new Error('offline'); return {success:true,sessionId:ref.current.session,ledger:ref.current.session==='synthetic-session'?ref.current.ledger:emptyTaskLedger()}; }).current;
 const visibleLedger = offline && disconnected ? disconnected : ledger;
 const latest = ledger.attempts.at(-1)!;
 const visibleAttempt = visibleLedger.attempts.at(-1)!;
 const messages: Message[] = session==='synthetic-session' ? [{id:'user',role:'user',content:'修复接口权限并完成回归验收',timestamp:new Date(start)}, {id:'reply',role:'assistant',timestamp:new Date(start),content:[{id:'tool',type:'tool_use',tool:{id:'child',name:'Agent',streamIndex:0,input:{},parsedInput:{description:work.title},subagentLifecycle:visibleAttempt.lifecycle}}]}] : [];
 const tab={tabId:'orchestration-synthetic-tab',sessionId:session,messages,streamingMessage:visibleAttempt.lifecycle.status==='running'?messages[1]:null,sessionState:visibleAttempt.lifecycle.status==='running'?'running':'idle',agentPlanTodos:null,isSessionLoading:false,apiGet,hasMoreBefore:false} as unknown as TabContextValue;
 const change = (state:SessionTaskLedger) => { setLedger(state); if (!offline) window.dispatchEvent(new CustomEvent('session-task-orchestration',{detail:{sessionId:session,ledger:state}})); };
 const review = (decision:'accept'|'reject') => {try{change(apply(ledger,{kind:'review',taskId:'api-repair',attemptId:latest.id,decision,evidence:decision==='accept'?'主 Agent 已核对修改文件，回归测试通过。':'接口边界仍有缺口，请补充修复和回归。',expectedRevision:ledger.revision}));}catch(e){setNote(String(e));}};
 return <ThemeRuntimeProvider selection={{themeId:'myagents-default',appearanceMode:dark?'dark':'light'}}><TabContext.Provider value={tab}>
 <main className="flex h-dvh min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
  <header className="border-b border-[var(--line)] px-5 py-4"><h1 className="font-semibold">会话任务编排</h1><p className="mt-1 text-xs text-[var(--ink-muted)]">合成验收环境 · 真实产品组件 · 不操作业务数据</p></header>
  <div className="min-h-0 flex-1 overflow-auto p-5"><p>我会核查接口权限，收到子 Agent 回传后复验，确认通过再完成任务。</p><div className="mt-5 flex flex-wrap gap-2 text-xs">
   <button onClick={()=>change(observe(ledger,[{...latest,lifecycle:{...latest.lifecycle,status:'completed',result:'已提交接口修复和回归结果。'}}]))}>回传结果</button>
   <button onClick={()=>review('accept')}>主 Agent 验收通过</button><button onClick={()=>review('reject')}>验收返工</button>
   <button onClick={()=>{const ordinal=(latest.lifecycle.activation?.ordinal??1)+1;change(observe(ledger,[{...work,id:`child:run-${ordinal}`,lifecycle:{...work.lifecycle,startedAt:Date.now(),activation:{id:`run-${ordinal}`,ordinal,state:'running'}}}]));}}>重试</button>
   <button onClick={()=>change(observe(ledger,[{...work,lifecycle:{...work.lifecycle,status:'completed'}}]))}>旧结果晚到</button>
   <button onClick={()=>{setDisconnected(ledger);setOffline(!offline);setNote(offline?'已恢复，正在重新同步':'已断线，保留确认状态');}}>{offline?'重新连接':'断线'}</button>
   <button onClick={()=>{setSession(session==='synthetic-session'?'other-session':'synthetic-session');setSelected(null);}}>切换会话</button>
   <button onClick={()=>setDark(!dark)}>切换明暗主题</button>
   <button onClick={()=>change(initial())}>重置合成场景</button>
  </div><p role="status" className="mt-3 text-xs text-[var(--ink-muted)]">{note}</p></div>
  <div className="p-3"><ExecutionStatusBar activity={{containerRef:{current:null},onJumpToTool:()=>{},onSelectSubagent:setSelected}}/><div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4"><textarea aria-label="消息输入" className="w-full resize-none bg-transparent outline-none" placeholder="输入消息…"/></div></div>
  {selected&&<div className="absolute inset-y-0 right-0 flex w-full max-w-md"><SubagentInspector toolId={selected} overlay onClose={()=>setSelected(null)} onJumpToTool={()=>{}}/></div>}
 </main><style>{'button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}main>div button{min-height:32px}'}</style>
 </TabContext.Provider></ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview/>);
