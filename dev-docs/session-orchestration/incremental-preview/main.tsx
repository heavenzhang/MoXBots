import {SessionTaskOrchestrationProvider} from '@/components/agent-status/useSessionTaskOrchestration';
import {SessionTaskActionsContext} from '@/components/agent-status/SessionTaskActionsContext';
import SessionTaskResults from '@/components/agent-status/SessionTaskResults';
// Incremental design harness. All execution, approvals, queues and IO are simulated.
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './fixture-source.css';
import './style.css';
import {i18n} from '@/i18n';
import {ThemeRuntimeProvider} from '@/theme';
import {TabContext} from '@/context/TabContext';
import {ConfigDataContext} from '@/config/ConfigProvider';
import {DEFAULT_CONFIG} from '@/config/types';
import {ImagePreviewProvider,useImagePreview} from '@/context/ImagePreviewContext';
import {ToastProvider} from '@/components/Toast';
import MessageList from '@/components/MessageList';
import SimpleChatInput from '@/components/chat-input/SimpleChatInput';
import type {ImageAttachment, SimpleChatInputHandle, SimpleChatInputProps} from '@/components/chat-input/types';
import type {VirtuosoHandle} from 'react-virtuoso';
import type {TabContextValue} from '@/context/TabContext';
import type {ConfigDataValue} from '@/config/ConfigProvider';
import type {PermissionMode, Provider} from '@/config/types';
import type {QueuedMessageInfo} from '@/types/queue';
import type {SessionGoal} from '@/types/sessionGoal';
import type {ContentBlock, Message} from '@/types/chat';
import {collectTaskAttempts,type SessionTaskLedger, type SessionTaskReview} from '@/../shared/sessionTaskOrchestration';
import {ComparisonContext} from './fixtureContext';
import {PanelRightIcon,SearchIcon,PlusIcon,FolderIcon,ChevronDownIcon,SettingsIcon,BellIcon,ClockIcon,WrenchIcon,GlobeIcon,CloseIcon,CheckIcon} from '@/components/icons';

const stamp=new Date(Date.now()-30_000);
const titles=['梳理原会话布局','统一任务事件状态','融入原有会话交互','完成集成验收'];
const ids=['scope','events','ui','integration'];
const provider={id:'demo-provider',name:'演示模型服务',type:'subscription',isEnabled:true,config:{baseUrl:'http://127.0.0.1:4352/prototype-disabled',apiProtocol:'anthropic:messages',authType:'auth_token',defaultModel:'demo-model'},models:[{model:'demo-model',modelName:'演示模型',displayName:'演示模型',isEnabled:true,vision:true,supportsVision:true,inputModalities:['text','image'],supportedReasoningEfforts:['low','medium','high']}]} as unknown as Provider;
type CompareMode = 'before' | 'after' | 'split';
type PreviewNote = {text: string; user: boolean};
type PreviewQueue = Omit<QueuedMessageInfo, 'images'> & {images?: ImageAttachment[]};
type PreviewModal = {title: string; text: string; artifact?: boolean};
type PaneRegistration = {
 input: React.RefObject<SimpleChatInputHandle | null>;
 list: React.RefObject<VirtuosoHandle | null>;
 scroller: React.MutableRefObject<HTMLElement | null>;
 scrollToBottom: () => void;
};
type PreviewShared = {
 mode: CompareMode; stage: string; highlight: boolean; queues: PreviewQueue[]; notes: PreviewNote[];
 permission: boolean; stopped: boolean; goalPaused: boolean; active: string;
 model: string; effort: string; permissionMode: PermissionMode; toolsEnabled: boolean;
 setActive: (value: string) => void; setModel: (value: string) => void;
 setEffort: (value: string) => void; setPermissionMode: (value: PermissionMode) => void;
 setToolsEnabled: (value: boolean) => void; setGoalPaused: (value: boolean) => void;
 showModal: (title: string, text: string) => void; showInspector: (id: string) => void;
 onArtifact: () => void; onReview: () => void; onRework: () => void;
 cancelQueue: (id: string) => void; forceQueue: (id: string) => void;
 enqueue: (text: string, images: ImageAttachment[]) => void;
 permissionDecision: (decision: string) => void; stop: () => void;
};
const emptyApi=async()=>({success:true,messages:[],hasMore:false});
const todoFor=(stage:string)=>titles.map((content,index)=>({key:ids[index],content,activeForm:index===2?'正在整合会话内交互':'',status:(stage==='done'||index===0?'completed':index===1&&(stage==='returned'||stage==='review'||stage==='rework')?'completed':index===2?'in_progress':'pending') as 'completed'|'in_progress'|'pending'}));
const phaseFor=(stage:string,id:string)=>{
 if(stage==='done')return 'accepted';if(id==='scope')return 'accepted';if(id==='integration')return 'blocked';
 if(id==='events')return stage==='rework'?'accepted':stage==='returned'||stage==='review'?'awaiting':'running';
 if(stage==='returned'||stage==='review')return 'awaiting';if(stage==='rework')return 'rework';return 'running';
};
const messageSet=(stage:string,notes:PreviewNote[]):Message[]=>{
 const returned=['returned','review','done'].includes(stage);
 const aComplete=['returned','review','rework','done'].includes(stage);
 const agent=(id:string,description:string,complete:boolean):ContentBlock=>({id:'block-'+id,type:'tool_use' as const,tool:{id,name:'Agent',input:{description,prompt:description,run_in_background:false},parsedInput:{description,prompt:description,run_in_background:false},streamIndex:0,isLoading:!complete,result:complete?'已整理成果和检查说明，等待主 Agent 核对。':undefined,subagentLifecycle:{status:complete?'completed' as const:'running' as const,startedAt:stamp.getTime(),finishedAt:complete?stamp.getTime()+30000:undefined,description,agentId:id,activation:{id:id+'-attempt-'+(stage==='rework'&&id==='agent-ui'?2:1),ordinal:stage==='rework'&&id==='agent-ui'?2:1,state:complete?'completed':'running'},result:complete?'已保留原有工具调用、附件、排队与审批入口，成果已回传。':undefined},subagentCalls:[{id:id+'-read',name:'Read',input:{file_path:'src/renderer/pages/Chat.tsx'},parsedInput:{file_path:'src/renderer/pages/Chat.tsx'},result:'已检查现有 Chat 布局及输入区占位。'}]}});
 return [
 {id:'user-request',role:'user',timestamp:stamp,content:'按原布局增强任务编排。保留工具调用、附件、排队、审批和完整输入框，回传后先验收。',attachments:[{id:'reference',name:'界面参考.png',size:128000,mimeType:'image/png',isImage:true,previewUrl:'/sample-attachment.png'}]},
 {id:'plan',role:'assistant',timestamp:stamp,content:[{id:'text-plan',type:'text',text:'我会沿用当前会话布局：先核对组件，再并行处理状态同步与界面整合，最后复核成果。\n\n1. 梳理原布局\n2. 统一任务状态\n3. 将任务信息融入原工具卡与成果消息\n4. 集成验收'}]},
 {id:'read-layout',role:'assistant',timestamp:stamp,content:[{id:'thinking',type:'thinking',thinking:'先核对消息列表、工具分组、排队面板和 Composer，避免新增内容遮挡输入或原审批。'},{id:'read',type:'tool_use',tool:{id:'read-layout-tool',name:'Read',streamIndex:0,input:{file_path:'src/renderer/pages/Chat.tsx'},parsedInput:{file_path:'src/renderer/pages/Chat.tsx'},result:'MessageList 使用虚拟列表；SimpleChatInput 保留队列、附件、工具与模型配置。'}}]},
 {id:'delegates',role:'assistant',timestamp:stamp,content:[agent('agent-events','核对事件状态与重试恢复',aComplete),agent('agent-ui','保留原布局并整合会话交互',returned)]},
 {id:'outcome',role:'assistant',timestamp:stamp,content:stage==='done'?'已对照完成标准验收通过，成果和检查记录已保留。':stage==='rework'?'界面任务需补齐窄屏适配，已保留通过的成果，只重做这一项。':returned?'子 Agent 已回传修改与检查说明。我会核对当前成果，再决定是否通过验收。':'正在核对布局与执行事件。你可以继续补充要求，消息会按现有机制排队。'},
 ...notes.map((n,i)=>({id:'note-'+i,role:n.user?'user':'assistant',timestamp:stamp,content:n.text} as Message)),
 ];
};
function ledgerFor(stage:string):SessionTaskLedger{
 const phaseA=phaseFor(stage,'events'),phaseB=phaseFor(stage,'ui');
 const attempts=collectTaskAttempts(messageSet(stage,[]),'delegates');
 const a=attempts.find(attempt=>attempt.toolUseId==='agent-events')!,b=attempts.find(attempt=>attempt.toolUseId==='agent-ui')!;
 const priorUi=stage==='rework'?collectTaskAttempts(messageSet('returned',[])).find(attempt=>attempt.toolUseId==='agent-ui'):undefined;
 return {revision:stage==='done'?9:stage==='rework'?7:stage==='returned'?5:3,tasks:titles.map((title,i)=>({id:ids[i],title,blockedBy:i===3?['events','ui']:[]})),bindings:{'agent-events':'events','agent-ui':'ui'},currentTools:{events:'agent-events',ui:'agent-ui'},attempts:priorUi?[a,priorUi,b]:[a,b],reviews:[...(priorUi?[{taskId:'ui',attemptId:priorUi.id,decision:'reject',evidence:'窄屏适配需补齐；只返工当前界面任务。'}]:[]),{taskId:'scope',attemptId:'main',decision:'accept',evidence:'已核对原布局与保留项。'},...(phaseA==='accepted'?[{taskId:'events',attemptId:a.id,decision:'accept',evidence:'主 Agent 已核对事件与恢复说明。'}]:[]),...(phaseB==='accepted'?[{taskId:'ui',attemptId:b.id,decision:'accept',evidence:'主 Agent 已检查原布局融合结果。'}]:[]),...(stage==='done'?[{taskId:'integration',attemptId:'main',decision:'accept',evidence:'原型内集成检查已通过，非生产验收。'}]:[])] as SessionTaskReview[]};
}
function Pane({enhanced,shared,register}:{enhanced:boolean;shared:PreviewShared;register:(id:string, value:PaneRegistration|null)=>void}){
 const paneId=enhanced?'after':'before',sessionId='implementation-preview-'+paneId;
 const visible=shared.mode==='split'||shared.mode===paneId;
 const windowPresentation=useMemo(()=>({surfaceAvailable:visible,generation:0}),[visible]);
 const input=useRef<SimpleChatInputHandle>(null),list=useRef<VirtuosoHandle>(null),follow=useRef<boolean|'force'>(true),scroller=useRef<HTMLElement|null>(null),container=useRef<HTMLDivElement>(null);
 const [overlayHeight,setOverlayHeight]=useState(260),[receipt,setReceipt]=useState('');
 const recoveringPlan=shared.stage==='unsupported-plan';
 const showingPlan=recoveringPlan||shared.stage==='supported-plan';
 const messages=useMemo(()=>messageSet(showingPlan?'returned':shared.stage,shared.notes),[shared.stage,shared.notes,showingPlan]);
 const ledgerRevision=useRef(0);
 const ledger=useMemo(()=>({...ledgerFor(showingPlan?'returned':shared.stage),revision:++ledgerRevision.current,...(showingPlan?{proposal:{sessionId,id:'recovered-plan',revision:1,policyVersion:'1',state:'awaiting_confirmation' as const,content:{objective:recoveringPlan?'恢复已有方案，核对运行时的确认能力':'先核对方案范围，再确认继续执行',scope:recoveringPlan?'原任务、历史成果、附件及草稿全部保留。当前场景模拟切换至不支持强确认的运行时。':'仅模拟支持确认的方案编辑与布局；原输入、草稿、附件及队列均保留，不发送真实消息或运行任务。',steps:[{id:'next-work',title:'核对并继续下一步任务'}],acceptanceCriteria:[recoveringPlan?'切换至支持的运行时后再确认；本地演示不执行真实任务。':'原输入、方案详情和调整意见可正常访问；本地演示不执行真实任务。']},changes:[]}}:{})}),[shared.stage,showingPlan,recoveringPlan,sessionId]);
 const heightSeeds=useMemo(()=>messages.map((m,i)=>i===0?190:i===1?250:i===3?220:120),[messages]);
 const attachScroller=useCallback((el:HTMLElement|Window|null)=>{scroller.current=el instanceof HTMLElement?el:null},[]);
 const handlePermission=useCallback(async(_id:string,decision:string)=>shared.permissionDecision(decision),[shared.permissionDecision]);
 const ledRef=useRef(ledger);ledRef.current=ledger;
 const apiGet=useCallback(async(path:string)=>path.includes('task-orchestration')?{success:true,sessionId,ledger:ledRef.current,planSupport:{supported:!recoveringPlan,runtime:recoveringPlan?'codex':'builtin',...(recoveringPlan?{reason:'PLAN_RUNTIME_DELEGATION_UNAVAILABLE'}:{})}}:{success:true,messages:[],hasMore:false},[sessionId,recoveringPlan]);
 const scrollToBottom=useCallback(()=>{requestAnimationFrame(()=>{const el=scroller.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:'auto'});else list.current?.scrollToIndex({index:'LAST',align:'end',behavior:'auto'});requestAnimationFrame(()=>{const ready=scroller.current;if(ready&&follow.current)ready.scrollTo({top:ready.scrollHeight,behavior:'auto'})})});},[]);
 const handleAtBottom=useCallback((atBottom:boolean)=>{follow.current=atBottom},[]);
 const getTime=useCallback(()=>0,[]);
 const onOverlay=useCallback((h:number)=>setOverlayHeight(h),[]);
 const tab=useMemo(()=>({tabId:'preview-'+paneId,sessionId,sessionRuntime:recoveringPlan?'codex':null,sessionRuntimeSessionId:sessionId,messages,streamingMessage:shared.stage==='running'||shared.stage==='approval'||shared.stage==='rework'?messages[3]:null,sessionState:shared.stopped?'idle':'running',isLoading:!shared.stopped,queuedMessages:shared.queues,agentPlanTodos:todoFor(shared.stage),isSessionLoading:false,hasMoreBefore:false,loadOlderMessages:async()=>{},apiGet,apiPost:emptyApi}),[sessionId,messages,shared.stage,shared.stopped,apiGet]);
 const activity=useMemo(()=>({containerRef:container,onJumpToTool:(id:string)=>{setReceipt('已定位原工具调用：'+id);scrollToBottom()},onSelectSubagent:(id:string)=>shared.showInspector(id)}),[shared.showInspector,scrollToBottom]);
 const taskForTool=useMemo(()=>({'agent-events':{id:'events',label:'任务 02 · 统一事件状态',phase:phaseFor(shared.stage,'events'),status:({running:'执行中',awaiting:'回传待验收',accepted:'已验收'} as Record<string,string>)[phaseFor(shared.stage,'events')]},'agent-ui':{id:'ui',label:'任务 03 · 原布局融合',phase:phaseFor(shared.stage,'ui'),status:({running:'执行中',awaiting:'回传待验收',accepted:'已验收',rework:'第 2 次尝试 · 返工中'} as Record<string,string>)[phaseFor(shared.stage,'ui')]}}),[shared.stage]);
 const ctx=useMemo(()=>({enhanced,stage:shared.stage,highlight:shared.highlight,taskForTool,onArtifact:shared.onArtifact,onReview:shared.onReview,onRework:shared.onRework}),[enhanced,shared.stage,shared.highlight,taskForTool,shared.onArtifact,shared.onReview,shared.onRework]);
 const goal=useMemo<SessionGoal>(()=>({id:'goal-'+paneId,workspacePath:'/prototype',sessionId,objective:'在原会话中完成任务编排增强',status:shared.goalPaused?'paused':'active',endConditions:{aiCanExit:true},notifyEnabled:false,permissionMode:'auto',turnCount:1,createdAt:'',updatedAt:'',totalDurationMs:0,totalTokens:0,revision:1,controlRevision:1,isExecuting:!shared.goalPaused}),[paneId,sessionId,shared.goalPaused]);
 useLayoutEffect(()=>{register(paneId,{input,list,scroller,scrollToBottom});return()=>register(paneId,null)},[paneId,register,scrollToBottom]);
 useEffect(()=>{window.dispatchEvent(new CustomEvent('session-task-orchestration',{detail:{sessionId,ledger}}));if(follow.current)scrollToBottom()},[ledger,sessionId,scrollToBottom]);
 useEffect(()=>{if(visible){const frame=requestAnimationFrame(()=>scrollToBottom());return()=>cancelAnimationFrame(frame)}},[visible,scrollToBottom]);
 useEffect(()=>{if(follow.current)scrollToBottom()},[shared.stage,shared.permission,scrollToBottom]);
 const onSend=useCallback(async(text:string,images:ImageAttachment[] = [])=>{shared.enqueue(text,images);return true},[shared.enqueue]);
 const editQueue=useCallback(async(id:string)=>{if(input.current?.getCurrentValue().trim()||input.current?.getImages().length){setReceipt('输入框已有草稿或附件，保留后再编辑排队消息。');return false}const item=shared.queues.find((q:PreviewQueue)=>q.queueId===id);if(!item)return false;input.current?.setValue(item.text);input.current?.setImages(item.images??[]);shared.cancelQueue(id);setReceipt('排队消息已取回原输入框，可继续编辑。');return true},[shared.queues,shared.cancelQueue]);
 const queued=useMemo<QueuedMessageInfo[]>(()=>shared.queues.map(queue=>({...queue,images:queue.images?.map(image=>({...image,name:image.name??image.file.name}))})),[shared.queues]);
 const foot=useMemo(()=><SessionTaskResults/>,[]);
 const TaskProvider=enhanced?SessionTaskOrchestrationProvider:React.Fragment;
 const taskActions=useMemo(()=>({disabled:shared.permission,onInspect:shared.showInspector,onReview:async()=>{shared.onReview();return true},onComposeRework:()=>{const old=input.current?.getCurrentValue()??'';input.current?.setValue(old+'\n\n请返工当前界面成果，原因：')}}),[shared.permission,shared.showInspector,shared.onReview]);
 return <ComparisonContext.Provider value={ctx}><TabContext.Provider value={tab as unknown as TabContextValue}><TaskProvider><SessionTaskActionsContext.Provider value={enhanced?taskActions:null}><section className="compare-pane" data-pane={paneId} onFocusCapture={()=>shared.setActive(paneId)}>
  <div className="pane-heading"><span>{enhanced?'增强后':'增强前'}</span><span>{enhanced?'同一布局，只新增任务关联与验收':'原组件与相同会话内容'}</span></div>
  <div className="chat-live" ref={container}>
   <MessageList firstItemIndex={1_000_000} messages={messages} heightEstimateSeed={heightSeeds} streamingMessage={null} isLoading={false} isStreaming={false} sessionState={shared.stopped?'idle':'running'} getQueryElapsedSeconds={getTime} sessionId={sessionId} isActive={visible} windowPresentation={windowPresentation} virtuosoRef={list} onScrollerRef={attachScroller} followEnabledRef={follow} scrollToBottom={scrollToBottom} handleAtBottomChange={handleAtBottom} bottomSpacerPx={overlayHeight} pendingPermission={shared.permission?{requestId:'permission-'+sessionId,sessionId,toolUseId:'test-layout',rootToolUseId:'root-test',toolName:'Bash',input:JSON.stringify({command:'npm run test:ui -- --layout',cwd:'/prototype/MoXBots'}),display:{command:'npm run test:ui -- --layout',cwd:'/prototype/MoXBots',description:'运行本地布局检查（模拟，不执行命令）'},suppressAlwaysAllowRule:true}:null} onPermissionDecision={handlePermission} footerContent={foot}/>
   <div className="composer-owner" data-composer-owner>
    <SimpleChatInput ref={input} composerTabId={'fixture-'+paneId} value="" active={shared.active===paneId} onSend={onSend} onStop={shared.stop} isLoading={!shared.stopped} sessionState={shared.stopped?'idle':'running'} provider={provider} providers={[provider]} providerAvailable availableProviderIds={[provider.id]} selectedModel={shared.model} modelMode={shared.model==='auto'?'auto':'manual'} onAutoModelSelect={()=>shared.setModel('auto')} onModelChange={shared.setModel} onBuiltinModelSelect={(v:Parameters<NonNullable<SimpleChatInputProps['onBuiltinModelSelect']>>[0])=>shared.setModel(v.model)} onProviderChange={()=>shared.setModel('demo-model')} reasoningEffort={shared.effort} onReasoningEffortChange={shared.setEffort} permissionMode={shared.permissionMode} onPermissionModeChange={shared.setPermissionMode} workspacePath="/prototype/MoXBots" sessionId={sessionId} workspaceSlashCommands={[{name:'review',description:'检查当前成果（原型）',source:'custom',scope:'project'}]} mcpServers={[{id:'fixture-files',name:'文件工具',description:'仅原型内存数据'}]} workspaceMcpEnabled={shared.toolsEnabled?['fixture-files']:[]} onWorkspaceMcpToggle={()=>shared.setToolsEnabled(!shared.toolsEnabled)} agentActivity={activity} queuedMessages={queued} onCancelQueued={async id=>{shared.cancelQueue(id);return true}} onEditQueued={editQueue} onForceExecuteQueued={async id=>{shared.forceQueue(id);return true}} sessionGoal={goal} goalIsExecuting={!shared.goalPaused} onGoalPause={()=>shared.setGoalPaused(true)} onGoalResume={()=>shared.setGoalPaused(false)} onGoalEdit={()=>shared.showModal('目标设置','原有目标设置入口仍保留；本原型不修改真实目标。')} onGoalCancel={()=>shared.setGoalPaused(true)} onOpenAgentSettings={()=>shared.showModal('原设置入口','模型、权限与工具菜单仍使用原 Composer，所有选择只保存在此原型内。')} contextIndicator={<button type="button" className="native-context" onClick={()=>shared.showModal('上下文 · 模拟','此处保留原输入区的上下文指示槽位。演示不生成真实 Token 消耗。')}>上下文</button>} onOverlayHeightChange={onOverlay}/>
   </div>
  </div>
  {receipt&&<div className="pane-receipt" role="status">{receipt}<button onClick={()=>setReceipt('')}>关闭</button></div>}
 </section></SessionTaskActionsContext.Provider></TaskProvider></TabContext.Provider></ComparisonContext.Provider>;
}
function App(){
 const [mode,setMode]=useState<CompareMode>('after'),[stage,setStage]=useState('returned'),[dark,setDark]=useState(false),[highlight,setHighlight]=useState(true),[workspace,setWorkspace]=useState(false),[narrow,setNarrow]=useState(innerWidth<1100),[active,setActive]=useState('after');
 const [queues,setQueues]=useState<PreviewQueue[]>([{timestamp:stamp.getTime(),queueId:'queue-1',text:'补充：窄屏也要保留原审批和排队操作。',canCancel:true,canForceExecute:true}]);
 const [permission,setPermission]=useState(false),[stopped,setStopped]=useState(false),[goalPaused,setGoalPaused]=useState(false),[notes,setNotes]=useState<PreviewNote[]>([]),[model,setModel]=useState('demo-model'),[effort,setEffort]=useState('default'),[permissionMode,setPermissionMode]=useState<PermissionMode>('auto'),[toolsEnabled,setToolsEnabled]=useState(true),[modal,setModal]=useState<PreviewModal|null>(null),[inspector,setInspector]=useState<string|null>(null);
 const refs=useRef<Record<string,PaneRegistration>>({}),serial=useRef(2);
 const {openPreview}=useImagePreview();
 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setModal(null);setInspector(null)}};addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[]);
 const register=useCallback((id:string,value:PaneRegistration|null)=>{if(value)refs.current[id]=value;else delete refs.current[id]},[]);
 const showModal=useCallback((title:string,text:string)=>setModal({title,text}),[]);
 const onArtifact=useCallback(()=>setModal({title:'会话交互成果 · 模拟',artifact:true,text:'任务信息附着原工具调用；验收与返工在成果节点操作。关闭预览后，原输入草稿、附件和排队消息保持原状。'}),[]);
 const addNote=useCallback((text:string,user=false)=>setNotes(n=>[...n,{text,user}]),[]);
 const onReview=useCallback(()=>{setStage('review');addNote('主 Agent 正在对照原布局保留项验收；已有工具审批与任务验收分别处理。')},[addNote]);
 const onRework=useCallback(()=>{setStage('rework');addNote('只返工「原布局融合」任务，旧成果和验收原因保留。')},[addNote]);
 const cancelQueue=useCallback((id:string)=>setQueues(q=>q.filter(item=>item.queueId!==id)),[]);
 const forceQueue=useCallback((id:string)=>{const item=queues.find(it=>it.queueId===id);if(item){addNote(item.text,true);if(/返工|重做/.test(item.text))setStage('rework')}setQueues(q=>q.filter(it=>it.queueId!==id));setStopped(false)},[addNote,queues]);
 const enqueue=useCallback((text:string,images:ImageAttachment[] = [])=>{setQueues(q=>[...q,{timestamp:Date.now(),queueId:'queue-'+serial.current++,text,images,canCancel:true,canForceExecute:true}])},[]);
 const permissionDecision=useCallback((decision:string)=>{setPermission(false);addNote(decision==='deny'?'已拒绝本次工具执行（模拟），当前成果仍待验收。':'已允许本次工具执行（模拟）；这不代表任务已验收。')},[addNote]);
 const stop=useCallback(()=>{setStopped(true);addNote('原会话停止入口已响应（模拟），不改变已有验收记录。')},[addNote]);
 const changeMode=(next:CompareMode)=>{const src=refs.current[active]?.input.current;const draft=src?.getCurrentValue()??'';const images=src?.getImages()??[];const target=next==='before'?'before':'after';refs.current[target]?.input.current?.setValue(draft);refs.current[target]?.input.current?.setImages(images);setMode(next);setActive(target);requestAnimationFrame(()=>refs.current[target]?.scrollToBottom())};
 const choose=(next:string)=>{setStage(next);setPermission(next==='approval');setStopped(next==='done'||next==='unsupported-plan'||next==='supported-plan');setNotes([])};
 useEffect(()=>{const resize=()=>{const n=innerWidth<1100;setNarrow(n);if(n&&mode==='split')changeMode('after')};addEventListener('resize',resize);return()=>removeEventListener('resize',resize)},[mode,active]);
 const shared={mode,stage,highlight,queues,notes,permission,stopped,goalPaused,active,setActive,model,setModel,effort,setEffort,permissionMode,setPermissionMode,toolsEnabled,setToolsEnabled,setGoalPaused,showModal,onArtifact,onReview,onRework,cancelQueue,forceQueue,enqueue,permissionDecision,stop,showInspector:setInspector};
 const config=useMemo(()=>({config:{...DEFAULT_CONFIG,agents:[],chatSendShortcut:'enter'},projects:[],providers:[provider],apiKeys:{},providerVerifyStatus:{},isLoading:false,error:null,managedCodexRuntimeUpdateInFlight:false}),[]);
 const view=()=>refs.current[active]??refs.current.after;
 const attach=()=>{view()?.input.current?.setImages([{id:'draft-reference',file:new File(['prototype image'],'界面参考.png',{type:'image/png'}),name:'界面参考.png',preview:'/sample-attachment.png',mimeType:'image/png'}]);};
 const advance=()=>{if(queues.length&&stage!=='review'&&!permission){forceQueue(queues[0].queueId);return}if(permission){showModal('先处理原工具审批','任务验收不能替代工具权限审批。请在会话中的原审批卡选择允许或拒绝。');return}if(stage==='review'){setStage('done');setStopped(true);addNote('主 Agent 已核对原型成果，验收通过。本地模拟不代表生产验收。')}else if(stage==='done')choose('running');else choose('returned')};
 (window as Window & {comparisonState?:()=>unknown}).comparisonState=()=>({mode,stage,permission,queues:queues.map(q=>({...q})),goalPaused,stopped,model,effort,permissionMode,notes});
 return <ConfigDataContext.Provider value={config as ConfigDataValue}><ThemeRuntimeProvider selection={{themeId:'myagents-light',appearanceMode:dark?'dark':'light'}}>
  <div className="prototype-controls"><div><strong>原布局 · 实现验收</strong><span className="prototype-flag">生产组件 / 模拟执行</span></div><div className="preview-actions"><div className="mode-switch" role="group" aria-label="增强前后对比">{([['before','增强前'],['after','增强后'],['split','并排对比']] as const).map(([v,label])=><button key={v} disabled={v==='split'&&narrow} aria-pressed={mode===v} onClick={()=>changeMode(v)}>{label}</button>)}</div><select aria-label="演示场景" value={stage} onChange={e=>choose(e.target.value)}><option value="running">并行执行</option><option value="approval">工具审批</option><option value="returned">回传待验收</option><option value="review">主 Agent 验收中</option><option value="rework">局部返工</option><option value="done">验收完成</option><option value="unsupported-plan">历史方案 · 能力不支持</option><option value="supported-plan">方案草案 · 支持确认</option></select><button onClick={()=>setDark(!dark)}>{dark?'浅色':'深色'}</button><button aria-pressed={highlight} onClick={()=>setHighlight(!highlight)}>标出增量</button></div></div>
  <div className="app-frame"><aside className="original-sidebar"><div className="native-safe-space"><span>● ● ●</span><PanelRightIcon className="size-4"/></div><div className="original-brand"><img src="/moxbots-icon.png" alt=""/><strong>MoXBots</strong><SearchIcon className="size-4"/></div><div className="sidebar-nav"><div><PlusIcon/>新对话</div><div><ClockIcon/>自动化任务</div><div><WrenchIcon/>技能与工具</div><div><GlobeIcon/>AgentNet 局域网络</div></div><div className="sidebar-group">Agent 工作区</div><div className="workspace-row"><ChevronDownIcon/><FolderIcon/>MoXBots</div><div className="session-selected">原布局任务编排</div><div className="sidebar-other">界面设计讨论</div><div className="sidebar-other">产品需求整理</div><div className="sidebar-bottom"><div>小助理</div><div><SettingsIcon/>设置</div><div className="account-row"><span>原型演示账号</span><BellIcon/></div></div></aside>
   <div className="page-shell"><header className="original-header"><div><span>原布局任务编排</span><span className="header-context">MoXBots</span></div><div><button onClick={()=>setWorkspace(!workspace)} aria-pressed={workspace}><PanelRightIcon className="size-4"/>工作区</button><button onClick={()=>showModal('会话菜单 · 原入口','当前 Runtime 身份、会话信息和设置入口保留在原位置；本原型不切换真实运行环境。')}>···</button></div></header>
    <div className="content-and-workspace"><div className={'comparison-grid '+mode} data-comparison-mode={mode}><div className={'pane-holder before-holder '+(mode==='after'?'not-shown':'')}><Pane enhanced={false} shared={shared} register={register}/></div><div className={'pane-holder after-holder '+(mode==='before'?'not-shown':'')}><Pane enhanced shared={shared} register={register}/></div></div>
    {workspace&&<aside className="right-workspace"><div className="right-workspace-head"><span>MoXBots · 工作区</span><button aria-label="关闭工作区" onClick={()=>setWorkspace(false)}><CloseIcon className="size-4"/></button></div><div className="workspace-path">main · /prototype/MoXBots</div><div className="tree-row">▾ src / renderer</div><button onClick={onArtifact}>▤ Chat.tsx</button><button onClick={onArtifact}>▤ SimpleChatInput.tsx</button><button onClick={onArtifact}>▤ MessageList.tsx</button><div className="workspace-placeholder">文件、预览、终端与浏览器<br/>仍在原工作区打开</div></aside>}
    </div>
   </div>
  </div>
  <footer className="prototype-tools"><span>{mode==='split'?'左右为同一段会话，差异只来自任务编排增量。':'保留原消息与输入区，切换增强前后可直接比较。'}</span><div><span>演示工具</span><button onClick={attach}>加入示例附件</button><button onClick={advance}>推进模拟事件</button><button onClick={()=>{setQueues([{timestamp:stamp.getTime(),queueId:'queue-1',text:'补充：窄屏也要保留原审批和排队操作。',canCancel:true,canForceExecute:true}]);choose('returned')}}>重置场景</button></div></footer>
  {modal&&<div className="prototype-modal-backdrop" role="presentation" onClick={()=>setModal(null)}><div className="prototype-modal" role="dialog" aria-label={modal.title} aria-modal="true" onClick={e=>e.stopPropagation()}><div><h2>{modal.title}</h2><button aria-label="关闭预览" onClick={()=>setModal(null)}><CloseIcon className="size-4"/></button></div><p>{modal.text}</p>{modal.artifact&&<><div className="artifact-preview"><div>现有工具调用</div><div><CheckIcon className="size-4"/>任务 02 · 成果已回传，等待主 Agent 验收</div><div>原附件、排队与输入工具条仍在原位</div></div><button onClick={()=>openPreview('/sample-attachment.png','界面参考.png')}>查看示例参考图</button></>}</div></div>}
  {inspector&&<div className="prototype-modal-backdrop" onClick={()=>setInspector(null)}><div className="prototype-modal" role="dialog" aria-label="原子 Agent 详情" onClick={e=>e.stopPropagation()}><div><h2>原子 Agent 详情入口</h2><button aria-label="关闭详情" onClick={()=>setInspector(null)}><CloseIcon className="size-4"/></button></div><p>保留 {inspector} 的原详情路径。任务编排信息不会另起一个子 Agent 聊天。</p><button onClick={()=>setInspector(null)}>返回原会话</button></div></div>}
 </ThemeRuntimeProvider></ConfigDataContext.Provider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<ToastProvider><ImagePreviewProvider><App/></ImagePreviewProvider></ToastProvider>);
