import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { i18n } from '@/i18n';
import { ThemeRuntimeProvider } from '@/theme';
import { SessionFilesButton } from '@/components/SessionFilesButton';
import { FileActionContext, type FileActionContextValue } from '@/context/fileActionState';
import type { Message } from '@/types/chat';
void i18n.changeLanguage('zh-CN');
const messages: Message[] = [{id:'report', role:'assistant', timestamp:new Date(0), content:'[本周销售周报](reports/本周销售周报.docx) [客户反馈汇总](客户反馈汇总.pdf) [长名称](reports/需要进行详细核对的客户售后反馈与本周处理进度说明.xlsx)'}];
function Preview() {
 const [dark,setDark]=useState(true);const [receipt,setReceipt]=useState('尚未执行文件操作');const [session,setSession]=useState(0);const [older,setOlder]=useState(false);const [fail,setFail]=useState(false);
 const fileActions={workspacePath:'/synthetic',openFileTarget:(target:{path:string})=>setReceipt('已委托预览：'+target.path)} as FileActionContextValue;
 return <ThemeRuntimeProvider selection={{themeId:'myagents-default',appearanceMode:dark?'dark':'light'}}>
 <main className="min-h-screen bg-[var(--paper-elevated)] p-4 text-[var(--ink)]">
 <div className="mx-auto max-w-3xl">
 <p className="mb-4 text-xs text-[var(--ink-muted)]">实际生产组件 · 合成对话/预览回调 · 无真实文件读写</p>
 <div className="mb-5 flex flex-wrap gap-4 text-sm"><button onClick={()=>setDark(!dark)}>切换明暗</button><button onClick={()=>setSession(n=>n+1)}>切换会话</button><button onClick={()=>setFail(!fail)}>分页失败：{fail?'开':'关'}</button></div>
 <header className="flex items-center justify-between border-b border-[var(--line)] pb-3"><span>销售助手 / 本周工作</span>
 <FileActionContext.Provider value={fileActions}><SessionFilesButton active key={session} messages={session?[]:older?[{...messages[0],id:'older',content:'[上周报告](archive/上周报告.pdf)'},...messages]:messages} hasMoreBefore={!older}
 onLoadOlder={async()=>{if(fail)throw new Error('synthetic');setOlder(true);}} onNavigate={id=>setReceipt('已定位来源：'+id)} /></FileActionContext.Provider></header>
 <section className="py-8 text-sm leading-7"><p>周报和客户反馈汇总已整理，请查看文件并核对相关数据。</p><p className="mt-3 text-[var(--ink-secondary)]">标题栏的文件入口集中呈现当前会话的文件记录。</p></section>
 <output className="block rounded-lg bg-[var(--paper-inset)] p-3 text-sm" aria-label="操作回执">{receipt}</output>
 </div></main></ThemeRuntimeProvider>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
