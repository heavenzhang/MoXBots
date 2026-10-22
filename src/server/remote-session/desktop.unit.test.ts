import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
const f=vi.hoisted(()=>({
  admission:vi.fn(),registry:vi.fn(),metadata:vi.fn(),list:vi.fn(),save:vi.fn(),publish:vi.fn(),claim:vi.fn(),snapshot:vi.fn(),begin:vi.fn(),read:vi.fn(),finish:vi.fn(),adopt:vi.fn(),stop:vi.fn(),send:vi.fn(),permission:vi.fn(),question:vi.fn(),plan:vi.fn(),ctx:vi.fn(),turn:vi.fn(),pending:vi.fn(),mcp:vi.fn(),shown:vi.fn(),materialize:vi.fn(),config:vi.fn(),visible:vi.fn(),ready:vi.fn(),interactions:vi.fn(),
}));
vi.mock('../utils/agent-workspace-identity',()=>({resolvePersistedAgentWorkspaceRegistry:f.registry}));
vi.mock('../utils/session-materialization',()=>({createMaterializedSessionMetadata:f.materialize}));
vi.mock('../utils/admin-config',()=>({resolveWorkspaceConfig:f.config}));
vi.mock('../utils/managed-codex-readiness',()=>({isManagedCodexProviderReady:f.ready}));
vi.mock('../admin-api',()=>({handleAgentShow:f.shown}));
vi.mock('../SessionStore',()=>({getSessionMetadata:f.metadata,getSessionsByAgentDir:f.list,isHistoryVisibleSession:f.visible,saveSessionMetadata:f.save,publishSessionForHandoff:f.publish,claimPreparedSessionForTurnAdmission:f.claim}));
vi.mock('../session-engine',()=>({runProcessUpdateAdmission:f.admission,stopActiveTurn:f.stop,getSessionEngine:()=>({getCurrentSessionContext:f.ctx,getExecutionTurnId:f.turn,getStreamReplaySnapshot:f.pending,sendDesktopMessage:f.send,respondPermission:f.permission,respondAskUserQuestion:f.question,respondPlanApproval:f.plan,updateMcpServers:f.mcp})}));
vi.mock('./projection',()=>({buildRemoteSnapshot:f.snapshot,projectRemoteInteractions:f.interactions}));
vi.mock('./receipts',async()=>{
  const actual=await vi.importActual<typeof import('./receipts')>('./receipts');
  return {...actual,createRemoteReceiptOwner:()=>({begin:f.begin,read:f.read,finish:f.finish,adoptPrepared:f.adopt})};
});
import {handleDesktopRemoteSession,prepareDesktopRemoteSession,resolveDesktopRemoteTarget} from './desktop';
const agent={agentId:'agent',workspacePath:'/workspace',agent:{id:'agent',enabled:true,name:'Agent'},project:{id:'p',path:'/workspace'}};
const mutation=()=>({kind:'send' as const,agentId:'agent',sessionId:'session',operationId:randomUUID(),text:'hi'});
function receipt(request:ReturnType<typeof mutation>,status='processing'){return {kind:'receipt',agentId:request.agentId,operationId:request.operationId,sessionId:request.sessionId,status,code:null}}
beforeEach(()=>{
  vi.resetAllMocks();f.admission.mockImplementation(async operation=>operation());vi.stubEnv('MYAGENTS_SIDECAR_GENERATION','gen');
  f.registry.mockResolvedValue({agentProjections:[agent],diagnostics:[],config:{}});
  f.metadata.mockReturnValue({id:'session',agentDir:'/workspace',title:'session'});f.visible.mockReturnValue(true);
  f.ctx.mockReturnValue({sessionId:'session',workspacePath:'/workspace'});f.turn.mockReturnValue('turn');
  f.config.mockReturnValue({mcpServers:[],permissionMode:'auto',model:'model'});f.mcp.mockResolvedValue({success:true});
  f.begin.mockImplementation(async request=>({fresh:true,receipt:receipt(request)}));f.finish.mockResolvedValue({});
  f.send.mockResolvedValue({success:true,dispatchAcceptance:Promise.resolve({accepted:true})});
  f.pending.mockReturnValue({pendingInteractiveRequests:[]});f.interactions.mockReturnValue([]);
  f.publish.mockResolvedValue(true);
});
afterEach(()=>vi.unstubAllEnvs());
async function settle(){await vi.waitFor(()=>expect(f.finish).toHaveBeenCalled())}
it.each(['enqueue','dispatch'] as const)('persists the safe refusal from %s and never executes a duplicate rejected operation',async phase=>{
  const request=mutation();
  const error='Provider "private-provider" is unavailable or missing an API key. secret-token';
  f.send.mockResolvedValue(phase==='enqueue'?{success:false,error}:{success:true,dispatchAcceptance:Promise.resolve({accepted:false,error})});
  await handleDesktopRemoteSession({request,generation:'gen'},'session');await settle();
  expect(f.finish).toHaveBeenCalledWith(request,'rejected','session','REMOTE_PROVIDER_UNAVAILABLE');
  const rejected={...receipt(request,'rejected'),code:'REMOTE_PROVIDER_UNAVAILABLE'};
  f.begin.mockResolvedValueOnce({fresh:false,receipt:rejected});
  expect(await handleDesktopRemoteSession({request,generation:'gen'},'session')).toMatchObject({data:rejected});
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(f.finish.mock.calls)).not.toContain('secret-token');
});
it.each(['enqueue','dispatch'] as const)('reports first-message %s rejection without binding or re-adopting its prepared Session',async phase=>{
  const request={kind:'start' as const,agentId:'agent',operationId:randomUUID(),text:'first remote task'};
  const initial={kind:'receipt',agentId:'agent',operationId:request.operationId,sessionId:'session',status:'processing',code:null};
  f.read.mockResolvedValue(initial);f.adopt.mockResolvedValue(true);
  const error='Provider/model selection is incomplete. Select a provider-model pair before sending.';
  f.send.mockResolvedValue(phase==='enqueue'?{success:false,error}:{success:true,dispatchAcceptance:Promise.resolve({accepted:false,error})});
  const envelope={request,generation:'gen',preparedSessionId:'11111111-1111-4111-8111-111111111111'};
  // Use the exact prepared Session ID throughout the original owner boundary.
  const id=envelope.preparedSessionId;f.metadata.mockReturnValue({id,agentDir:'/workspace',materializationState:'prepared',materializationSourceSessionId:request.operationId});
  f.ctx.mockReturnValue({sessionId:id,workspacePath:'/workspace'});f.read.mockResolvedValue({...initial,sessionId:id});
  await handleDesktopRemoteSession(envelope,'session');await settle();
  expect(f.finish).toHaveBeenCalledWith(request,'rejected',id,'REMOTE_PROVIDER_SELECTION_REQUIRED');
  f.read.mockResolvedValue({...initial,sessionId:id,status:'rejected',code:'REMOTE_PROVIDER_SELECTION_REQUIRED'});
  expect(await handleDesktopRemoteSession(envelope,'session')).toMatchObject({data:{status:'rejected',code:'REMOTE_PROVIDER_SELECTION_REQUIRED'}});
  expect(f.send).toHaveBeenCalledTimes(1);expect(f.adopt).toHaveBeenCalledTimes(1);
});
it('reads history and admits explicit messages while proactive mode is off without enabling it',async()=>{
  const passive={...agent,agent:{...agent.agent,enabled:false}};
  f.registry.mockResolvedValue({agentProjections:[passive],diagnostics:[],config:{}});
  f.list.mockReturnValue([{id:'session',title:'Existing history',lastActiveAt:'2026-10-21T00:00:00Z'}]);
  expect(await handleDesktopRemoteSession({request:{kind:'list',agentId:'agent',limit:30},generation:'gen'},'global')).toMatchObject({success:true,data:{kind:'list',items:[{sessionId:'session',title:'Existing history'}]}});
  expect(await resolveDesktopRemoteTarget('agent','session')).toMatchObject({identity:passive});
  const request=mutation();
  expect(await handleDesktopRemoteSession({request,generation:'gen'},'session')).toMatchObject({success:true,data:{status:'processing'}});
  await settle();
  expect(f.send).toHaveBeenCalledOnce();
  expect(passive.agent.enabled).toBe(false);
});
it.each([
  {agentProjections:[],diagnostics:[],config:{}},
  {agentProjections:[{...agent,project:undefined}],diagnostics:[],config:{}},
  {agentProjections:[{...agent,project:{...agent.project,hidden:true}}],diagnostics:[],config:{}},
  {agentProjections:[{...agent,project:{...agent.project,internal:true}}],diagnostics:[],config:{}},
  {agentProjections:[{...agent,project:{...agent.project,archivedAt:'2026-10-21T00:00:00Z'}}],diagnostics:[],config:{}},
  {agentProjections:[agent],diagnostics:[{agentIds:['agent']}],config:{}},
])('rejects unavailable or ambiguous workspace identities before read or admission (%#)',async registry=>{
  f.registry.mockResolvedValue(registry);
  expect(await handleDesktopRemoteSession({request:{kind:'list',agentId:'agent',limit:30},generation:'gen'},'global')).toMatchObject({code:'REMOTE_AGENT_UNAVAILABLE'});
  expect(await handleDesktopRemoteSession({request:mutation(),generation:'gen'},'session')).toMatchObject({code:'REMOTE_AGENT_UNAVAILABLE'});
  expect(f.list).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();expect(f.begin).not.toHaveBeenCalled();
});
it('refuses cross-workspace session and obsolete envelope generation before admission',async()=>{
  const request=mutation();
  f.metadata.mockReturnValueOnce({id:'session',agentDir:'/other'});
  expect(await handleDesktopRemoteSession({request,generation:'gen'},'session')).toMatchObject({code:'REMOTE_SESSION_NOT_FOUND'});
  expect(await handleDesktopRemoteSession({request,generation:'old'},'session')).toMatchObject({code:'REMOTE_SESSION_OWNER_CHANGED'});
  expect(f.send).not.toHaveBeenCalled();expect(f.begin).not.toHaveBeenCalled();
});
it('returns processing before actual dispatch acceptance and does not repeat accepted requests',async()=>{
  const request=mutation();let complete!:(v:{accepted:boolean})=>void;
  f.send.mockResolvedValue({success:true,dispatchAcceptance:new Promise(resolve=>{complete=resolve})});
  expect(await handleDesktopRemoteSession({request,generation:'gen'},'session')).toMatchObject({success:true,data:{status:'processing'}});
  await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1));expect(f.finish).not.toHaveBeenCalled();
  f.begin.mockResolvedValueOnce({fresh:false,receipt:receipt(request,'accepted')});
  expect(await handleDesktopRemoteSession({request,generation:'gen'},'session')).toMatchObject({data:{status:'accepted'}});expect(f.send).toHaveBeenCalledTimes(1);
  complete({accepted:true});await settle();expect(f.finish).toHaveBeenCalledWith(request,'accepted','session');
});
it.each(['respond','stop'] as const)('rejects obsolete request generation for %s even with valid current envelope and turn',async kind=>{
  const request={...mutation(),kind,generation:'old',turnId:'turn',...(kind==='respond'?{requestId:'permission',interaction:'permission',approved:true}:{})};
  delete (request as {text?:string}).text;
  await handleDesktopRemoteSession({request,generation:'gen'},'session');await settle();
  expect(f.finish).toHaveBeenCalledWith(request,'rejected','session','REMOTE_SESSION_INTERACTION_EXPIRED');
  expect(f.stop).not.toHaveBeenCalled();expect(f.permission).not.toHaveBeenCalled();
});
it('acknowledges an existing Session queued send so the current turn can still receive approvals',async()=>{
  const request=mutation();f.send.mockResolvedValue({success:true,queued:true,queueId:'queue-1',dispatchAcceptance:new Promise(()=>{})});
  expect(await handleDesktopRemoteSession({request,generation:'gen'},'session')).toMatchObject({data:{status:'processing'}});
  await settle();expect(f.finish).toHaveBeenCalledWith(request,'accepted','session');
});
it('requires actual complete pending approval; cannot invent permanent permissions',async()=>{
  const request={kind:'respond' as const,agentId:'agent',sessionId:'session',operationId:randomUUID(),generation:'gen',turnId:'turn',requestId:'r',interaction:'permission' as const,approved:true};
  f.interactions.mockReturnValue([{requestId:'r',interaction:'permission',actionable:false,questions:[]}]);
  await handleDesktopRemoteSession({request,generation:'gen'},'session');await settle();
  expect(f.finish).toHaveBeenCalledWith(request,'rejected','session','REMOTE_INTERACTION_REQUIRES_TARGET_UI');expect(f.permission).not.toHaveBeenCalled();
});
it('prepares a frozen original Session before creation and repeated start returns receipt without new metadata',async()=>{
  const request={kind:'start' as const,agentId:'agent',operationId:randomUUID(),text:'hello'};
  f.shown.mockResolvedValue({success:true,data:{effectiveDefaults:{runtime:'codex',runtimeSource:'system-cli'}}});f.materialize.mockReturnValue({id:'new',agentDir:'/workspace',title:'hello',transcriptFormat:2});f.ready.mockReturnValue(false);
  const result=await prepareDesktopRemoteSession({request});expect(result).toMatchObject({success:true,data:{agentId:'agent',workspacePath:'/workspace'}});
  expect(f.materialize).toHaveBeenCalledWith(expect.objectContaining({runtimeOverride:'codex',runtimeSourceOverride:'system-cli',agent:agent.agent}));
  expect(f.save).toHaveBeenCalledWith(expect.objectContaining({materializationState:'prepared',materializationSourceSessionId:request.operationId}));
  expect(f.publish).toHaveBeenCalledTimes(1);
  f.begin.mockResolvedValueOnce({fresh:false,receipt:{kind:'receipt',agentId:'agent',operationId:request.operationId,sessionId:'new',status:'unconfirmed',code:null}});
  expect(await prepareDesktopRemoteSession({request})).toMatchObject({data:{receipt:{status:'unconfirmed'}}});expect(f.save).toHaveBeenCalledTimes(1);
});
it('bounds UTF8 list payloads and continues pagination at the last item actually returned',async()=>{
  f.list.mockReturnValue(Array.from({length:30},(_,i)=>({id:`session-${i}`,lastActiveAt:'2026-10-15',title:'中'.repeat(256),lastMessagePreview:'中'.repeat(512)})));
  const result=await handleDesktopRemoteSession({request:{kind:'list',agentId:'agent',limit:30},generation:'gen'},'global');
  expect(result.success).toBe(true);
  if(result.success&&'data' in result&&result.data.kind==='list'){
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(48*1024);
    expect(result.data.items.length).toBeLessThan(30);expect(result.data.hasMore).toBe(true);
    expect(result.data.nextBefore).toBe(result.data.items.at(-1)!.sessionId);
  }
});
