import React, { useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext } from '@/context/TabContext';
import { ThemeRuntimeProvider } from '@/theme';
import AgentStatusPanel from '@/components/agent-status/AgentStatusPanel';
import { registerBackgroundTask, setBackgroundTaskStatus } from '@/utils/backgroundTaskStatus';
import { i18n } from '@/i18n';
import './qa.css';
import type { BackgroundTaskDetail } from '@/../shared/types/background-task';
void i18n.changeLanguage('zh-CN');
let mode = 'running', calls = 0;
const schedule = (next:string) => {setTimeout(()=>{mode=next;if(['completed','failed'].includes(next))setBackgroundTaskStatus('b-example',next,'tool-shell','qa-session');},3500);};
const started = Date.now() - 530000;
const task = (): BackgroundTaskDetail => ({
 taskId: 'b-example', toolUseId: 'tool-shell', description: '建立独立端口的测试验收隧道', taskType: 'local_bash',
 status: mode === 'completed' ? 'completed' : mode === 'failed' ? 'failed' : 'running', startedAt: started,
 finishedAt: ['completed','failed'].includes(mode) ? Date.now() : undefined,
 command: 'ssh -N -L 127.0.0.1:4321:127.0.0.1:8080 qa-host',
 output: mode === 'empty' || mode === 'missing' ? '' : mode === 'long' ? Array.from({length:200},(_,i)=>`[${i}] 2026-10-18 校验记录 ${'worker1234567890'.repeat(20)}`).join('\n') : mode === 'failed' ? 'bind [127.0.0.1]:4321: Address already in use' : `[19:01:51] Local forwarding listening on 127.0.0.1 port 4321.\n[19:01:52] 隧道已就绪，等待连接。\n[19:01:54] channel 2: new direct-tcpip\n[19:01:55] 请求完成。\n刷新次数 ${calls}`,
 outputState: mode === 'missing' ? 'missing' : mode === 'empty' ? 'empty' : 'ready', truncated: mode === 'long', totalBytes: mode === 'long' ? 120000 : 168, updatedAt: Date.now(),
});
const apiGet = async <T,>(path:string,opts?:{signal?:AbortSignal}):Promise<T> => { calls++; await new Promise(r=>setTimeout(r,120)); if(opts?.signal?.aborted) throw Error('aborted'); if(mode==='error') throw Error('offline'); return {success:true, task:task()} as T; };
registerBackgroundTask('b-example','tool-shell',{description:'建立独立端口的测试验收隧道',taskType:'local_bash'},'qa-session');
function Fixture() {
 const base=useContext(TabContext); const [dark,setDark]=useState(false); const [session,setSession]=useState('qa-session'); const [revision,setRevision]=useState(0);
 const value={...base, tabId:'qa-tab',sessionId:session,messages:[],sessionState:'running' as const,apiGet};
 return <ThemeRuntimeProvider selection={{themeId:'myagents-default',appearanceMode:dark?'dark':'light'}}><TabContext.Provider value={value}>
 <main style={{minHeight:'100dvh',background:'var(--paper)',color:'var(--ink)',padding:16}}>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>setDark(!dark)}>切换主题</button>{['running','empty','missing','long','failed','completed','error'].map(m=><button key={m} onClick={()=>{mode=m;if(['completed','failed'].includes(m))setBackgroundTaskStatus('b-example',m,'tool-shell','qa-session');setRevision(revision+1);}}>{m}</button>)}<button onClick={()=>schedule('completed')}>3秒后完成</button><button onClick={()=>schedule('failed')}>3秒后失败</button><button onClick={()=>schedule('error')}>3秒后断网</button><button onClick={()=>setTimeout(()=>setSession('other-session'),3500)}>3秒后切换会话</button><button onClick={()=>setSession(session==='qa-session'?'other-session':'qa-session')}>切换会话</button></div>
 <p style={{marginTop:24}}>实际生产 React 组件 · 合成任务与日志 · 只读验收</p>
 <div style={{position:'fixed',bottom:100,right:16,left:16,display:'flex',justifyContent:'flex-end'}}><AgentStatusPanel containerRef={React.createRef<HTMLElement>()} onJumpToTool={()=>{}}/></div>
 <textarea aria-label="对话草稿" defaultValue="保留当前草稿" style={{position:'fixed',bottom:16,left:16,right:16,height:64,background:'var(--paper-elevated)',border:'1px solid var(--line)',borderRadius:12,padding:12}}/>
 </main></TabContext.Provider></ThemeRuntimeProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
