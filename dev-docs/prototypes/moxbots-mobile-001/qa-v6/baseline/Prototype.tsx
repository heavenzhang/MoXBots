import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CopyIcon, QuoteIcon, ArrowDownIcon, PersonIcon, DrawingPinIcon, DrawingPinFilledIcon, DesktopIcon, ClockIcon, ArchiveIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Cross2Icon, DotsHorizontalIcon, DotsVerticalIcon, FileTextIcon, MagnifyingGlassIcon, MixerHorizontalIcon, PaperPlaneIcon, Pencil2Icon, ResetIcon, StopIcon } from "@radix-ui/react-icons";
import { AttachmentContent } from "./AttachmentContent";
import { ExecutionTrace } from "./ExecutionTrace";
import { ConversationTools } from "./ConversationTools";
import { AccountPages, type Profile } from "./AccountPages";
import { RequestPage, FilePage } from "./SessionFlows";
import { type Attachment, type ResultFile, type RequestState, resultFiles, modelName, requestStateText, suggestions } from "./prototype-domain";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard, useKeyboardInsets, useScreenPortal } from "./mobile";

type Message = { id:string; role:"user"|"assistant"; text:string; time:string; attachments?:Attachment[]; model?:string };
type Queued = { id:string; text:string; attachments?:Attachment[]; model?:string };
type Session = { id:string; botId:string; title:string; preview:string; time:string; status:"idle"|"running"|"waiting"|"stopped"; archived:boolean; pinned?:boolean; turnId?:string; queue?:Queued[]; messages:Message[]; request?:RequestState; traceRequest?:RequestState; requestId?:string; history?:{id:string;state:RequestState}[]; requestKind?:"files"|"command"; fileIds?:string[]; context?:string; model?:string; record?:boolean };
const bots = [
 {id:"research",name:"资料助理",device:"办公电脑",online:true,context:"产品资料"},
 {id:"dev",name:"研发助理",device:"Linux Host",online:true,context:"研发工作区"},
 {id:"product",name:"产品助理",device:"办公电脑",online:false,context:"产品设计"},
];
const msg=(role:Message["role"],text:string,time="刚刚"):Message=>({id:crypto.randomUUID(),role,text,time});
function seeds():Session[]{return [
 {id:"weekly",botId:"research",title:"产品周报",preview:"等待你确认保存文件",time:"刚刚",status:"waiting",turnId:"seed-weekly",archived:false,pinned:true,request:"pending",requestId:"weekly-save-1",requestKind:"files",record:true,messages:[msg("user","整理本周产品进展，生成周报和 PDF。","10:18"),msg("assistant","周报已整理。保存到项目目录前，需要你确认本次文件操作。","10:19")]},
 {id:"api",botId:"dev",title:"接口联调",preview:"正在检查接口返回…",time:"5分钟前",status:"running",turnId:"seed-api",archived:false,record:true,messages:[msg("user","请检查本次接口联调中的问题。","10:10"),msg("assistant","已开始检查接口返回与错误记录。你可以补充希望关注的接口。","10:11")]},
 {id:"meeting",botId:"research",title:"会议纪要整理",fileIds:["meeting-table","meeting-archive"],preview:"已整理出行动项和负责人",time:"10:20",status:"idle",archived:false,messages:[msg("user","帮我整理会议纪要中的行动项。","10:18"),msg("assistant","已整理出行动项和负责人。你希望按负责人还是按时间查看？","10:20")]},
 {id:"contract",botId:"research",title:"合同条款核对",preview:"已列出需要进一步确认的问题",time:"昨天",status:"idle",archived:false,messages:[msg("user","整理需要进一步确认的合同条款。","昨天"),msg("assistant","待确认事项已整理，可以继续补充关注点。","昨天")]},
 {id:"logs",botId:"dev",title:"部署日志排查",preview:"等待确认读取近期服务日志",time:"昨天",status:"waiting",turnId:"seed-logs",request:"pending",requestId:"logs-read-1",requestKind:"command",archived:false,messages:[msg("user","帮我看看部署日志中的报错。","昨天"),msg("assistant","需要读取最近 100 条服务日志。请确认本次只读命令后继续。","昨天")]},
 {id:"product",botId:"product",title:"产品需求讨论",preview:"下一步补充交互细节",time:"10月15日",status:"idle",archived:false,messages:[msg("user","一起讨论手机端的交互。","10月15日"),msg("assistant","先明确最常用的操作，再梳理页面关系。","10月15日")]},
];}
type Sheet="context"|"attachment"|"manage"|"scope"|"executor"|"options"|"rename"|"stop"|"about"|"reset"|"info"|null;
const labels={idle:"",running:"进行中",waiting:"待处理",stopped:"已停止"};
function IconButton({label,children,onClick,className="",disabled=false}:{label:string;children:ReactNode;onClick:()=>void;className?:string;disabled?:boolean}){
 return <button type="button" className={"icon-button "+className} aria-label={label} title={label} onPointerDown={e=>e.preventDefault()} onClick={onClick} disabled={disabled}>{children}</button>;
}
export default function Prototype(){
 const [composerHeight,setComposerHeight]=useState(150),[accountEntry,setAccountEntry]=useState(0),[chatTab,setChatTab]=useState<"messages"|"files">("messages"),[showLatest,setShowLatest]=useState(false),[attachmentPreview,setAttachmentPreview]=useState<Attachment|null>(null),[newContext,setNewContext]=useState("产品资料");
 const [sessions,setSessions]=useState<Session[]>(seeds);
 const [scope,setScope]=useState("all"),[query,setQuery]=useState("");
 const [filter,setFilter]=useState<"all"|"running"|"pending"|"archived">("all");
 const [route,setRoute]=useState<"list"|"chat"|"new"|"request"|"file"|"account">("list");
 const [activeId,setActiveId]=useState("weekly"),[sheet,setSheet]=useState<Sheet>(null);
 const [editId,setEditId]=useState("weekly"),[rename,setRename]=useState("");
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [newBotId,setNewBotId]=useState("research"),[lastBotId,setLastBotId]=useState("research"),[newDraft,setNewDraft]=useState("");
 const [sending,setSending]=useState(false),[toast,setToast]=useState(""),[,setRecords]=useState(false);
 const [profile,setProfile]=useState<Profile>({name:"体验用户",bio:"让工作在会话中继续",avatar:"blue"}),[font,setFont]=useState("standard"),[defaultModel,setDefaultModel]=useState("auto"),[newModel,setNewModel]=useState("auto"),[enterSend,setEnterSend]=useState(true);
 const [attachments,setAttachments]=useState<Record<string,Attachment[]>>({}),[newAttachments,setNewAttachments]=useState<Attachment[]>([]);
 const [selectedFile,setSelectedFile]=useState<ResultFile>(resultFiles[0]),[fileBack,setFileBack]=useState<"chat"|"account">("chat"),[savedIds,setSavedIds]=useState<string[]>([]),[failSave,setFailSave]=useState(false);
 const [requestNote,setRequestNote]=useState(""),[requestBusy,setRequestBusy]=useState(false),[requestOffline,setRequestOffline]=useState(false);
 const requestTarget=useRef<{sessionId:string;requestId?:string;turnId?:string}|null>(null),decisionBusy=useRef(false);
 const timers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
 const stopTarget=useRef<{sessionId:string;turnId?:string}|null>(null);
 const activeRef=useRef(activeId);activeRef.current=activeId;
 const sessionsRef=useRef(sessions);sessionsRef.current=sessions;
 const {screenRef}=useScreenPortal();
 const keyboard=useKeyboard();const {bottomInset,isKeyboardVisible}=useKeyboardInsets();
 // App content scrolls only inside MobileScroll. File chooser/focus restoration must not scroll the phone shell.
 useEffect(()=>{const screen=screenRef.current;if(!screen)return;const keep=()=>{if(screen.scrollTop||screen.scrollLeft)screen.scrollTo({top:0,left:0});};screen.addEventListener("scroll",keep,{passive:true});keep();return()=>screen.removeEventListener("scroll",keep);},[screenRef]);
 useEffect(()=>{screenRef.current?.scrollTo({top:0,left:0});},[route,sheet,isKeyboardVisible,screenRef]);
 const active=sessions.find(s=>s.id===activeId),edited=sessions.find(s=>s.id===editId);
 const bot=bots.find(b=>b.id===active?.botId)!,newBot=bots.find(b=>b.id===newBotId)!;
 const scopeName=scope==="all"?"全部 Bots":bots.find(b=>b.id===scope)?.name;
 const visible=sessions.filter(s=>s.archived===(filter==="archived")&&(scope==="all"||s.botId===scope)&&(filter!=="pending"||s.request==="pending")&&(filter!=="running"||s.status==="running")&&(s.title+" "+s.preview).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
 useEffect(()=>()=>Object.values(timers.current).forEach(clearTimeout),[]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(""),2600);return()=>clearTimeout(id);},[toast]);

 useEffect(()=>{const field=document.querySelector<HTMLTextAreaElement>(".composer textarea");if(field){field.style.height="46px";field.style.height=Math.min(112,Math.max(46,field.scrollHeight))+"px";}},[drafts,activeId,route]);
 useEffect(()=>{if(route!=="chat")return;const el=document.querySelector(".chat-scroll .mobile-scroll");if(!el)return;const check=()=>setShowLatest(el.scrollHeight-el.scrollTop-el.clientHeight>180);el.addEventListener("scroll",check,{passive:true});check();return()=>el.removeEventListener("scroll",check);},[route,activeId,chatTab,sessions]);
 useEffect(()=>{if(route!=="chat")return;const el=document.querySelector(".composer-wrap");if(!el)return;const resize=()=>setComposerHeight((el as HTMLElement).offsetHeight);const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();},[route]);
 function openSheet(next:Sheet){if(next==="stop"){const target=route==="chat"?active:edited;stopTarget.current=target?{sessionId:target.id,turnId:target.turnId}:null;}keyboard.hide();setSheet(next);}
 function goList(){keyboard.hide();setRoute("list");}
 function openSession(s:Session){keyboard.hide();setChatTab("messages");setActiveId(s.id);setRecords(false);setRoute("chat");}
 function update(id:string,change:Partial<Session>){setSessions(ss=>ss.map(s=>s.id===id?{...s,...change}:s));}
 function putOnTop(id:string,change:Partial<Session>){setSessions(ss=>{const s=ss.find(s=>s.id===id);return s?[{...s,...change,time:"刚刚"},...ss.filter(s=>s.id!==id)]:ss;});}
 function latest(){requestAnimationFrame(()=>{const el=document.querySelector(".chat-scroll .mobile-scroll");if(el)el.scrollTop=el.scrollHeight;});}
 function respond(id:string,text:string,delay=5000){
  clearTimeout(timers.current[id]);
  timers.current[id]=setTimeout(()=>{
   const current=sessionsRef.current.find(s=>s.id===id);
   delete timers.current[id];
   if(!current||current.status!=="running")return;
   const [next,...rest]=current.queue||[];
   const scroll=document.querySelector(".chat-scroll .mobile-scroll");
   const follow=scroll ? scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<160 : true;
   setSessions(ss=>ss.map(s=>s.id===id?{...s,status:next?"running":"idle",turnId:next?crypto.randomUUID():s.turnId,queue:rest,fileIds:s.request==="approved"&&!s.fileIds?(s.requestKind==="files"?["weekly-md","weekly-pdf"]:s.fileIds):s.fileIds,time:"刚刚",preview:next?"正在处理下一条消息…":text,messages:[...s.messages,msg("assistant",text),...(next?[{...msg("user",next.text),attachments:next.attachments,model:next.model}]:[])]}:s));
   if(activeRef.current===id&&follow)latest();
   if(next)respond(id,"已收到补充要求："+next.text+"。我会沿用当前会话的上下文继续处理。");
  },delay);
 }
 function newSession(){keyboard.hide();if(!newDraft.trim()&&!newAttachments.length){const chosen=scope!=="all"?scope:lastBotId;setNewBotId(chosen);setNewContext(bots.find(b=>b.id===chosen)!.context);setNewModel(defaultModel);}else setToast("已恢复未发送的新会话草稿");setRoute("new");}
 function createSession(){
  if((!newDraft.trim()&&!newAttachments.length)||!newBot.online||sending)return;
  keyboard.hide();setSending(true);const text=newDraft.trim()||"请查看这些附件",attached=newAttachments,id=crypto.randomUUID(),chosen=newBotId;
  timers.current.create=setTimeout(()=>{
   const s:Session={id,botId:chosen,title:text.length>15?text.slice(0,15)+"…":text,preview:"正在模拟回复…",time:"刚刚",status:"running",turnId:crypto.randomUUID(),archived:false,context:newContext,model:newModel,messages:[{...msg("user",text),attachments:attached,model:newModel}]};
   setSessions(ss=>[s,...ss]);setActiveId(id);setLastBotId(chosen);setNewDraft("");setNewAttachments([]);setSending(false);setChatTab("messages");setRoute("chat");setRecords(false);
   respond(id,"收到。我会先梳理相关内容，再整理可供你检查的结果。你可以在执行过程中补充要求。");delete timers.current.create;
  },450);
 }
 function send(){
  if(!active||!bot.online||active.archived||active.request==="pending")return;
  const attached=attachments[active.id]||[];const text=drafts[active.id]?.trim()||(attached.length?"请查看这些附件":"");if(!text)return;
  keyboard.hide();setDrafts(ds=>({...ds,[active.id]:""}));setAttachments(ds=>({...ds,[active.id]:[]}));
  if(active.status==="running"||active.queue?.length){
   update(active.id,{queue:[...(active.queue||[]),{id:crypto.randomUUID(),text,attachments:attached,model:active.model||"auto"}]});
   if(active.status==="running"&&!timers.current[active.id])respond(active.id,"本轮检查已结束，正在整理结果。",4500);
   setToast(active.status==="running"?"已加入队列，不打断当前执行":"已加入暂停的队列，可手动继续");latest();return;
  }
  putOnTop(active.id,{messages:[...active.messages,{...msg("user",text),attachments:attached,model:active.model||"auto"}],preview:"正在处理…",status:"running",traceRequest:undefined,turnId:crypto.randomUUID()});latest();
  if(active.request==="expired"&&text.includes("授权请求")){
   const id=active.id;timers.current[id]=setTimeout(()=>{const current=sessionsRef.current.find(s=>s.id===id);if(current?.status!=="running")return;delete timers.current[id];putOnTop(id,{request:"pending",requestId:crypto.randomUUID(),turnId:crypto.randomUUID(),status:"waiting",preview:"新的授权请求待确认",messages:[...current.messages,msg("assistant","已按当前内容重新发起本次授权，请查看新的操作范围后决定。")]});},1200);return;
  }
  respond(active.id,"已收到补充要求："+text+"。我会沿用当前会话的上下文继续处理。");
 }
 function runNext(){
  if(!active||!bot.online||active.archived||active.status==="running"||active.request==="pending"||!active.queue?.length)return;
  const [next,...rest]=active.queue;
  putOnTop(active.id,{queue:rest,status:"running",traceRequest:undefined,turnId:crypto.randomUUID(),preview:"正在处理…",messages:[...active.messages,{...msg("user",next.text),attachments:next.attachments,model:next.model}]});
  respond(active.id,"已收到补充要求："+next.text+"。我会沿用当前会话的上下文继续处理。");latest();
 }
 function togglePin(s:Session){update(s.id,{pinned:!s.pinned});setSheet(null);setToast(s.pinned?"已取消置顶":"会话已置顶");}
 function renameSession(){if(!edited||!rename.trim())return;update(edited.id,{title:rename.trim()});keyboard.hide();setSheet(null);setToast("会话已重命名");}
 function archiveSession(s:Session){update(s.id,{archived:!s.archived});setSheet(null);keyboard.hide();if(route==="chat")setRoute("list");setToast(s.archived?"已恢复到会话列表":"会话已归档，执行状态保持不变");}
 function showMenu(s:Session){setEditId(s.id);openSheet("manage");}
 function stop(){
  if(!edited)return;const target=stopTarget.current;const current=sessionsRef.current.find(s=>s.id===target?.sessionId);if(!current||current.id!==edited.id||current.turnId!==target?.turnId||(current.status!=="running"&&current.status!=="waiting")){setSheet(null);setToast("原来的执行已结束，未停止其他轮次");return;}clearTimeout(timers.current[edited.id]);delete timers.current[edited.id];
  update(edited.id,{status:"stopped",traceRequest:undefined,request:edited.request==="pending"?"denied":edited.request,preview:"当前执行已停止（模拟）",messages:[...edited.messages,msg("assistant","当前执行已停止（模拟）。会话历史保留，你可以继续发消息。")]});setSheet(null);setToast("当前执行已停止（模拟）");
 }
 function openRequest(s=active){if(!s||!s.request)return;keyboard.hide();setRequestOffline(false);setActiveId(s.id);if(requestTarget.current?.requestId!==s.requestId)setRequestNote("");requestTarget.current={sessionId:s.id,requestId:s.requestId,turnId:s.turnId};setRoute("request");}
 function decision(approved:boolean){
  const target=requestTarget.current,current=sessionsRef.current.find(s=>s.id===target?.sessionId);
  if(decisionBusy.current||requestOffline||!current||current.request!=="pending"||current.requestId!==target?.requestId||current.turnId!==target?.turnId)return;
  decisionBusy.current=true;setRequestBusy(true);keyboard.hide();const note=requestNote.trim();
  timers.current.decision=setTimeout(()=>{
   decisionBusy.current=false;setRequestBusy(false);delete timers.current.decision;
   const now=sessionsRef.current.find(s=>s.id===target?.sessionId);
   if(!now||now.request!=="pending"||now.requestId!==target?.requestId||now.turnId!==target?.turnId){setToast("请求状态已变化，没有重复提交");return;}
   putOnTop(now.id,{history:[...(now.history||[]),{id:now.requestId||crypto.randomUUID(),state:approved?"approved":"denied"}],request:approved?"approved":"denied",traceRequest:approved?"approved":"denied",status:approved?"running":"idle",turnId:approved?crypto.randomUUID():now.turnId,preview:approved?"已批准本次操作，正在处理…":"已拒绝本次操作",messages:[...now.messages,msg("assistant",approved?"你已允许本次操作，正在模拟执行。":"你已拒绝本次操作。"+(note?"补充说明："+note:"没有执行操作，可以继续讨论。"))]});
   if(approved)respond(now.id,now.requestKind==="files"?"产品周报已生成（模拟）。成果已关联在本会话，可打开预览并继续提出修改。":"已完成日志检查（模拟）。建议核对启动参数与配置路径，再确认是否需要修改。",1800);
  },650);
 }
 function openFile(file:ResultFile,from:"chat"|"account"="chat"){keyboard.hide();setSelectedFile(file);setFileBack(from);setFailSave(false);if(from==="account"){const owner=sessions.find(s=>s.fileIds?.includes(file.id));if(owner)setActiveId(owner.id);}setRoute("file");}
 function discussFile(instruction?:string){keyboard.hide();setChatTab("messages");setDrafts(ds=>({...ds,[activeId]:(ds[activeId]?ds[activeId]+"\n":"")+(instruction||"请修改「"+selectedFile.name+"」：")}));setRoute("chat");latest();}
 function demoCase(which:string){
  keyboard.hide();setSheet(null);if(which==="save-error"){setActiveId("meeting");setSelectedFile(resultFiles[2]);setSavedIds(ids=>ids.filter(id=>id!==resultFiles[2].id));setFileBack("account");setFailSave(true);setRoute("file");return;}
  clearTimeout(timers.current.weekly);delete timers.current.weekly;const state:RequestState=which==="expired"?"expired":which==="handled"?"handled":"pending";
  const id=crypto.randomUUID(),turn=crypto.randomUUID();update("weekly",{request:state,traceRequest:state,requestId:id,turnId:turn,status:state==="pending"?"waiting":"idle",preview:requestStateText[state]});setRequestOffline(which==="offline");setActiveId("weekly");setRequestNote("");requestTarget.current={sessionId:"weekly",requestId:id,turnId:turn};setRoute("request");
 }
 function resetDemo(){Object.values(timers.current).forEach(clearTimeout);timers.current={};setSessions(seeds());setScope("all");setQuery("");setFilter("all");setDrafts({});setAttachments({});setNewAttachments([]);setSavedIds([]);setRequestOffline(false);setRequestBusy(false);decisionBusy.current=false;setNewDraft("");setSending(false);setRoute("list");setSheet(null);setToast("已恢复初始示例");}
 const titles={context:"选择工作上下文",attachment:"附件预览",manage:"管理会话",scope:"查看哪些会话",executor:"由哪个 Bot 执行",options:"会话选项",rename:"重命名会话",stop:"停止当前执行？",reset:"重置示例？",info:"会话信息",about:"关于这个原型"};
 return <main className="mox-app" style={{"--composer-reserve":(composerHeight+(isKeyboardVisible?0:bottomInset))+"px","--new-footer-reserve":(66+(isKeyboardVisible?0:bottomInset))+"px"} as CSSProperties} data-text-size={font} aria-label="MoxBots 手机端交互原型">
  <section className="mox-view" hidden={route!=="list"} aria-label="远程会话列表">
   <header className="list-header">
    <div className="toolbar"><button className={"avatar-trigger "+profile.avatar} aria-label="打开个人中心" onPointerDown={e=>e.preventDefault()} onClick={()=>{keyboard.hide();setAccountEntry(n=>n+1);setRoute("account");}}><PersonIcon/></button><h1>{filter==="archived"?"已归档":"会话"}</h1><div className="toolbar-actions"><IconButton label="会话选项" onClick={()=>openSheet("options")}><MixerHorizontalIcon/></IconButton><IconButton label="新建会话" className="accent" onClick={newSession}><Pencil2Icon/></IconButton></div></div>
    <div className="scope-bar"><button className="scope-trigger" onClick={()=>openSheet("scope")}>{scopeName}<ChevronDownIcon/></button>{filter==="archived"?<button className="filter-link" onClick={()=>setFilter("all")}>返回会话</button>:<div className="state-tabs" role="group" aria-label="会话状态筛选">{([["all","全部"],["running","进行中"],["pending","待处理"+(sessions.filter(s=>s.request==="pending"&&!s.archived&&(scope==="all"||s.botId===scope)).length?" "+sessions.filter(s=>s.request==="pending"&&!s.archived&&(scope==="all"||s.botId===scope)).length:"")]] as const).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>{keyboard.hide();setFilter(key);}}>{label}</button>)}</div>}</div>
    <div className="search-field"><MagnifyingGlassIcon/><KeyboardInput aria-label="搜索会话" placeholder="搜索会话" value={query} onChange={e=>setQuery(e.target.value)} onBlur={()=>keyboard.hide()}/>{query&&<IconButton label="清空搜索" onClick={()=>{setQuery("");keyboard.hide();}}><Cross2Icon/></IconButton>}</div>
   </header>
   <MobileScroll className="list-scroll"><div className="session-list">
    {visible.map((s,index)=>{const b=bots.find(b=>b.id===s.botId)!;return <div key={s.id}>{s.pinned&&index===0&&<div className="list-section-title">置顶</div>}{!s.pinned&&index>0&&visible[index-1].pinned&&<div className="list-section-title">最近</div>}<div className="session-row" data-session-id={s.id}>
     <button className="session-open" onClick={()=>openSession(s)} aria-label={"打开会话："+s.title}><div className="row-title"><strong>{s.pinned&&<DrawingPinFilledIcon className="pin-mark"/>}{s.title}</strong><time>{s.time}</time></div><div className="row-preview"><span>{s.preview}</span>{labels[s.status]&&<span className={"state-label "+s.status}>{labels[s.status]}</span>}</div><div className="row-meta">{b.name} · {b.device}{!b.online&&<span> · 离线</span>}</div></button>
     <IconButton label={"会话菜单："+s.title} className="row-menu-button" onClick={()=>showMenu(s)}><DotsHorizontalIcon/></IconButton>
    </div></div>;})}
    {!visible.length&&<div className="empty-state"><p>{query?"没有找到匹配的会话":filter==="pending"?"暂时没有待处理请求":filter==="running"?"暂时没有进行中的会话":filter==="archived"?"还没有归档会话":"这里还没有会话"}</p><span>{query?"试试其他关键词，或切换 Bot 范围。":filter==="archived"?"归档的会话可在这里恢复。":"可以新建会话，继续你的工作。"}</span>{query?<button className="text-button" onClick={()=>setQuery("")}>清空搜索</button>:filter==="all"?<button className="text-button" onClick={newSession}>新建会话</button>:<button className="text-button" onClick={()=>setFilter("all")}>查看全部会话</button>}</div>}
    <div className="prototype-note">本地原型 · 不连接真实设备</div>
   </div></MobileScroll>
  </section>
  {route==="new"&&<section className="mox-view new-view" aria-label="新建会话">
   <header className="detail-header"><div className="toolbar"><IconButton label="返回会话列表" disabled={sending} onClick={goList}><ChevronLeftIcon/></IconButton><h2>新建会话</h2></div><span className="subtle header-note">先确定执行位置，再开始工作</span></header>
   <MobileScroll className="new-scroll"><div className="new-content">
    <button className="executor-control" onClick={()=>openSheet("executor")} disabled={sending}><div><span className="field-caption">执行 Bot</span><strong>{newBot.name}</strong><span className="subtle">{newBot.device} · {newBot.online?"在线":"离线"}</span></div><ChevronDownIcon/></button>
    <button className="context-picker" disabled={sending} onClick={()=>openSheet("context")}><span>工作上下文</span><strong>{newContext}</strong><ChevronDownIcon/></button><div className="new-intro"><h3>开始一段新会话</h3><p>把要求、资料和图片放在一起，工作会在所选 Bot 上继续。</p></div>
    <ConversationTools large disabledPlaceholder={sending?"正在提交消息…":"所选执行设备离线"} context={newContext} text={newDraft} onText={setNewDraft} attachments={newAttachments} onAttachments={setNewAttachments} model={newModel} onModel={setNewModel} disabled={sending||!newBot.online} onSend={createSession}/>
    {!newDraft.trim()&&!newAttachments.length&&<div className="new-starters">{["整理资料并列出要点","分析问题并给出方案","根据附件继续工作"].map(t=><button key={t} disabled={sending||!newBot.online} onClick={()=>setNewDraft(t)}>{t}</button>)}</div>}<p className="new-hint">当前为本地原型，附件与消息不会发往真实设备。</p>
   </div></MobileScroll>
   <footer className="new-footer" style={{bottom:bottomInset}}><button className="primary-button" onPointerDown={e=>e.preventDefault()} onClick={createSession} disabled={(!newDraft.trim()&&!newAttachments.length)||!newBot.online||sending}>{sending?"正在创建示例会话…":"发送并创建会话"}<PaperPlaneIcon/></button></footer>
  </section>}
  {route==="chat"&&active&&<section className="mox-view chat-view" aria-label="远程会话详情">
   <header className="detail-header chat-header"><div className="toolbar"><IconButton label="返回会话列表" onClick={goList}><ChevronLeftIcon/></IconButton><div className="chat-heading"><h2>{active.title}</h2><button className="session-identity" aria-label="查看会话信息" onClick={()=>openSheet("info")}><DesktopIcon/>{bot.name} · {bot.device}<ChevronDownIcon/></button></div><IconButton label="管理当前会话" onClick={()=>showMenu(active)}><DotsVerticalIcon/></IconButton></div>
    <div className={"connection-line "+active.status}><span className={"connection-indicator "+(!bot.online?"offline":"")} aria-hidden="true"/>{active.archived?"已归档":!bot.online?"设备离线":active.status==="waiting"?"等待你处理":active.status==="running"?"正在执行":active.status==="stopped"?"当前执行已停止":"会话可继续"} · {bot.device} · {bot.online?"在线":"离线"}（演示）</div><div className="conversation-tabs" role="tablist" aria-label="会话内容"><button role="tab" aria-selected={chatTab==="messages"} onClick={()=>{keyboard.hide();setChatTab("messages");}}>对话</button><button role="tab" aria-selected={chatTab==="files"} onClick={()=>{keyboard.hide();setChatTab("files");}}>成果 {active.fileIds?.length||0}</button></div>
   </header>
   <MobileScroll className="chat-scroll"><div className="messages" style={{paddingBottom:28}} key={active.id} hidden={chatTab!=="messages"}>
    {active.messages.map(m=><article className={"message "+m.role} key={m.id}><div className="message-body">{m.text}</div>{!!m.attachments?.length&&<div className="message-attachments">{m.attachments.map(a=><div key={a.id}><button className="message-attachment-open" aria-label={"预览消息附件："+a.name} onClick={()=>{setAttachmentPreview(a);openSheet("attachment");}}>{a.kind==="image"&&<img src={a.url} alt={a.name}/>}<strong>{a.name}</strong><small>{a.size} · 本地附件示例</small></button></div>)}</div>}<time>{m.time}{m.model?" · "+modelName(m.model):""}</time><div className="message-actions"><IconButton label="复制消息" onClick={()=>{void navigator.clipboard.writeText(m.text).then(()=>setToast("消息已复制"),()=>setToast("无法复制，请长按选择文字"));}}><CopyIcon/></IconButton>{m.role==="assistant"&&<IconButton label="引用并继续" onClick={()=>{setDrafts(ds=>({...ds,[active.id]:(ds[active.id]?ds[active.id]+"\n":"")+"> "+m.text.slice(0,160)+"\n请进一步说明："}));latest();}}><QuoteIcon/></IconButton>}</div></article>)}
    <ExecutionTrace status={active.status} request={active.traceRequest||(active.request==="pending"?active.request:undefined)} context={active.context||bot.context} hasResult={!!active.fileIds?.length}/>
    {active.request&&<div className={"inline-request request-card "+active.request}><span className="section-caption">{requestStateText[active.request]}</span><strong>{active.requestKind==="command"?"读取近期服务日志":"创建周报文件"}</strong><p>{active.request==="pending"?"请确认操作内容与影响范围。":"决定已记录，点击可查看详情。"}</p><button className="outline-button" onClick={()=>openRequest()}>{active.request==="pending"?"查看并处理":"查看授权记录"}</button></div>}
    {!!active.fileIds?.length&&<div className="inline-request result-files"><strong>成果文件 · {active.fileIds.length}</strong>{active.fileIds.map(id=>{const f=resultFiles.find(f=>f.id===id);return f&&<button key={id} className="file-row file-link" onClick={()=>openFile(f)}><FileTextIcon/><span>{f.name}<small>{f.size} · {f.version}</small></span><ChevronRightIcon/></button>;})}</div>}
    {!!active.queue?.length&&<div className="queued-box" aria-label="排队消息"><div className="queue-heading"><ClockIcon/><strong>待发送 · {active.queue.length}</strong><span>{active.status==="running"?"本轮结束后依次发送":"已暂停，可手动发送"}</span></div>{active.queue.map(q=><div className="queued-message" key={q.id}><p>{q.text}{q.attachments?.length?" · "+q.attachments.length+" 个附件":""}</p><IconButton label={"移除排队消息："+q.text} onClick={()=>update(active.id,{queue:active.queue?.filter(item=>item.id!==q.id)})}><Cross2Icon/></IconButton></div>)}{active.status!=="running"&&<button className="text-button" disabled={active.archived||!bot.online||active.request==="pending"} onClick={runNext}>发送下一条</button>}</div>}
    {active.status==="running"&&<div className="running-note" role="status">{timers.current[active.id]?"正在处理当前消息…":"正在检查接口返回…"}</div>}
   </div>{chatTab==="files"&&<div className="session-files-page" style={{paddingBottom:28}}><h3>会话成果</h3><p>由 {bot.name} 生成，保留在当前会话。</p>{active.fileIds?.length?active.fileIds.map(id=>{const f=resultFiles.find(f=>f.id===id)!;return <button key={id} className="saved-file-row" onClick={()=>openFile(f)}><FileTextIcon/><span>{f.name}<small>{f.size} · {f.version}</small></span><ChevronRightIcon/></button>;}):<div className="empty-state"><p>还没有成果文件</p><span>工作完成后，文件会显示在这里。</span><button className="text-button" onClick={()=>setChatTab("messages")}>返回对话继续</button></div>}</div>}</MobileScroll>
   {showLatest&&chatTab==="messages"&&<button className="jump-latest" aria-label="回到最新消息" style={{bottom:bottomInset+composerHeight+10}} onClick={latest}><ArrowDownIcon/>最新消息</button>}
   <div className="composer-wrap" style={{bottom:bottomInset}}>
    {active.archived?<div className="composer-notice">这是已归档的会话。<button onClick={()=>{update(active.id,{archived:false});setToast("会话已恢复");}}>恢复后继续</button></div>:!bot.online?<div className="composer-notice">执行设备离线，仍可查看历史消息。</div>:<ConversationTools context={active.context||bot.context} text={drafts[active.id]||""} onText={v=>setDrafts(ds=>({...ds,[active.id]:v}))} attachments={attachments[active.id]||[]} onAttachments={v=>setAttachments(ds=>({...ds,[active.id]:v}))} model={active.model||"auto"} onModel={v=>update(active.id,{model:v})} running={active.status==="running"} disabled={active.request==="pending"} onSend={send} onStop={()=>{setEditId(active.id);openSheet("stop");}} enterSend={enterSend} next={active.status!=="running"&&active.request!=="pending"?suggestions(active.title,active.messages.at(-1)?.text||""):undefined} hint={active.request==="pending"?"先处理本会话的授权请求":active.status==="running"?"补充内容将排队，不打断当前执行":active.queue?.length?"队列已暂停，点击发送下一条继续":"本地原型 · 不连接真实设备"}/>}
   </div>
  </section>}
  {route==="request"&&active?.request&&<RequestPage key={active.requestId} state={active.request} kind={active.requestKind||"files"} title={active.title} bot={bot.name} device={bot.device} busy={requestBusy} offline={requestOffline} note={requestNote} onNote={setRequestNote} onDecision={decision} onBack={()=>{keyboard.hide();setRoute("chat");}} onRenew={()=>{setDrafts(ds=>({...ds,[activeId]:(ds[activeId]?ds[activeId]+"\n":"")+"请按当前内容重新发起授权请求。"}));setRequestOffline(false);setRoute("chat");}}/>}
  {route==="file"&&active&&<FilePage key={selectedFile.id+(failSave?"-retry":"")} file={selectedFile} sessionTitle={active.title} bot={bot.name} saved={savedIds.includes(selectedFile.id)} onSaved={()=>setSavedIds(ids=>ids.includes(selectedFile.id)?ids:[...ids,selectedFile.id])} onBack={()=>{keyboard.hide();setRoute(fileBack);}} onDiscuss={discussFile} failFirst={failSave}/>}
  <AccountPages entry={accountEntry} visible={route==="account"} profile={profile} onProfile={setProfile} onBack={goList} savedFiles={resultFiles.filter(f=>savedIds.includes(f.id))} onFile={f=>openFile(f,"account")} onFont={setFont} onDefaultModel={setDefaultModel} onEnter={setEnterSend} requests={sessions.flatMap(s=>s.history?.length?s.history.map(h=>({title:s.title,state:requestStateText[h.state]})):s.request&&s.request!=="pending"?[{title:s.title,state:requestStateText[s.request]}]:[])} onDemo={demoCase}/>
  {toast&&<div className="mox-toast" role="status" style={{bottom:bottomInset+(route==="chat"?85:15)}}>{toast}</div>}
  <BottomSheet open={sheet!==null} onOpenChange={open=>{if(!open){keyboard.hide();setSheet(null);}}} title={sheet?titles[sheet]:""} description={sheet==="scope"?"筛选不改变已有会话的执行 Bot":sheet==="executor"?"选择后，新会话固定在该设备执行":"本地交互演示，不会操作远程设备"} snap={sheet==="attachment"?.85:(sheet==="scope"||sheet==="executor") ? .66 : sheet==="rename" ? .45 : .56}>
   <div className="mox-sheet-body" onPointerDownCapture={e=>{if((e.target as Element).closest("button"))e.preventDefault();}} onFocusCapture={()=>screenRef.current?.scrollTo({top:0,left:0})}><IconButton label="关闭面板" className="sheet-close" onClick={()=>{keyboard.hide();setSheet(null);}}><Cross2Icon/></IconButton>
    {sheet==="context"&&<div role="radiogroup" aria-label="工作上下文">{[newBot.context,"临时工作区","我的资料"].map(c=><button key={c} className="tool-option" role="radio" aria-checked={newContext===c} onClick={()=>{setNewContext(c);setSheet(null);}}><span>{c}<small>{newBot.device} · 示例上下文</small></span>{newContext===c&&<CheckIcon/>}</button>)}</div>}
    {sheet==="attachment"&&attachmentPreview&&<AttachmentContent attachment={attachmentPreview} onDone={()=>setSheet(null)}/>}
    {(sheet==="scope"||sheet==="executor")&&<div className="bot-list">
     {sheet==="scope"&&<button className="bot-option" role="radio" aria-checked={scope==="all"} onClick={()=>{setScope("all");setSheet(null);}}><span className={"radio "+(scope==="all"?"checked":"")}><CheckIcon/></span><div><strong>全部 Bots</strong><span>显示有权访问的远程会话</span></div></button>}
     {bots.map(b=>{const selected=sheet==="scope"?scope===b.id:newBotId===b.id,disabled=sheet==="executor"&&!b.online;return <button className="bot-option" key={b.id} role="radio" aria-checked={selected} disabled={disabled} onClick={()=>{if(sheet==="scope")setScope(b.id);else {setNewBotId(b.id);setNewContext(b.context);}setSheet(null);}}><span className={"radio "+(selected?"checked":"")}><CheckIcon/></span><div><strong>{b.name}</strong><span>{b.device} · {b.online?"在线":"离线"}{disabled?"，暂不可新建":""}</span></div></button>;})}
    </div>}
    {sheet==="manage"&&edited&&<div className="options-list manage-options" role="menu" aria-label={edited.title+"的管理菜单"}><p className="manage-target">{edited.title}<span>{bots.find(b=>b.id===edited.botId)?.name} · {bots.find(b=>b.id===edited.botId)?.device}</span></p><button role="menuitem" onClick={()=>togglePin(edited)}><DrawingPinIcon/>{edited.pinned?"取消置顶":"置顶"}</button><button role="menuitem" onClick={()=>{setRename(edited.title);openSheet("rename");}}><Pencil2Icon/>重命名</button><button role="menuitem" onClick={()=>archiveSession(edited)}><ArchiveIcon/>{edited.archived?"恢复会话":"归档"}</button>{(edited.status==="running"||edited.status==="waiting")&&<button role="menuitem" className="danger" onClick={()=>openSheet("stop")}><StopIcon/>停止当前执行</button>}</div>}
    {sheet==="options"&&<div className="options-list"><button onClick={()=>{setFilter("all");setSheet(null);}}>全部会话{filter==="all"&&<CheckIcon/>}</button><button onClick={()=>{setFilter("running");setSheet(null);}}>进行中{filter==="running"&&<CheckIcon/>}</button><button onClick={()=>{setFilter("pending");setSheet(null);}}>待处理{filter==="pending"&&<CheckIcon/>}</button><button onClick={()=>{setFilter("archived");setSheet(null);}}><ArchiveIcon/>已归档{filter==="archived"&&<CheckIcon/>}</button><button onClick={()=>openSheet("about")}>原型说明<ChevronRightIcon/></button><button onClick={()=>openSheet("reset")}><ResetIcon/>重置示例</button></div>}
    {sheet==="rename"&&<div className="sheet-form"><label htmlFor="rename-input">会话名称</label><KeyboardInput id="rename-input" aria-label="会话名称" value={rename} onChange={e=>setRename(e.target.value)} onBlur={()=>keyboard.hide()} maxLength={60} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)renameSession();}}/><p className="subtle">只修改名称，Bot 和执行设备保持不变。</p><button className="primary-button" disabled={!rename.trim()} onPointerDown={e=>e.preventDefault()} onClick={renameSession}>保存名称</button></div>}
    {sheet==="stop"&&<div className="sheet-form"><p>停止「{edited?.title}」的当前模拟执行。会话、历史和未发送的排队消息会保留。</p><p className="subtle">{bots.find(b=>b.id===edited?.botId)?.name} · {bots.find(b=>b.id===edited?.botId)?.device}</p><button className="danger-button" onClick={stop}>停止本轮执行</button><button className="secondary-button" onClick={()=>setSheet(null)}>继续执行</button></div>}

    {sheet==="about"&&<div className="sheet-form"><p>这是 MoxBots 会话管理的交互原型。</p><p className="subtle">可以新建和继续会话、排队发送、按 Bot 或状态筛选、搜索、置顶、重命名、归档、恢复和停止示例执行。手机框外可切换 iPhone 与 Pixel 10。</p><p className="local-note">全部内容为合成数据，仅保存在本页内存。刷新即重置，不连接账号、模型或远程设备。</p></div>}
    {sheet==="reset"&&<div className="sheet-form"><p>清除本页的示例修改，恢复最初六条会话。</p><p className="subtle">只影响此原型，不涉及真实数据。</p><button className="primary-button" onClick={resetDemo}>恢复初始示例</button><button className="secondary-button" onClick={()=>setSheet(null)}>取消</button></div>}
    {sheet==="info"&&active&&<div className="sheet-form session-info"><div><span>执行 Bot</span><strong>{bot.name}</strong></div><div><span>执行设备</span><strong>{bot.device}</strong></div><div><span>工作上下文</span><strong>{active.context||bot.context}</strong></div><div><span>设备连接</span><strong>{bot.online?"在线":"离线"}（示例）</strong></div><div><span>会话状态</span><strong>{active.archived?"已归档":labels[active.status]||"可继续"}</strong></div><p className="local-note">此会话固定由以上 Bot 和设备执行。切换列表筛选不会更改执行者；若需更换 Bot，请新建会话。</p><button className="secondary-button" onClick={()=>setSheet(null)}>返回会话</button></div>}

   </div>
  </BottomSheet>
 </main>;
}
