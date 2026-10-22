import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { isHostProviderId } from '../shared/hostProviderConfig';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { format } from 'node:util';
import { bootstrapFromEnvironment } from '../host/bot-session-bootstrap';
import { rejectCloudModelRetry } from '../host/cloud-model';
import { remoteSessionRequestSchema } from '../shared/remoteSession';
import { isProjectArchived, isProjectVisibleToUser } from '../shared/config-types';
import { assertOrdinaryRemoteAgent } from '../host/remote-session';
import { settleHostSessionAdmission } from '../host/remote-admission';
import { isHostSessionRequest, type HostSessionMessage, type HostSessionRequest } from './host-session-protocol';
import { installHostSessionCredential, installHostCloudModelCredential, resolveHostCloudModelProvider } from './utils/host-credentials';
import { isImageMimeType, USER_IMAGE_ATTACHMENT_MAX_BYTES } from '../shared/fileTypes';

// The supervisor is the only process owner. This entry owns exactly one existing
// Product Session binding, and never implements a second SDK or transcript store.
let initializationStage: 'admission' | 'credential' | 'modules' | 'session' | 'route' | 'restore' = 'admission';
async function main(): Promise<void> {
  const bot = bootstrapFromEnvironment();
  const generation = process.env.MYAGENTS_HOST_GENERATION;
  const workspace = process.env.MYAGENTS_HOST_WORKSPACE;
  if (!generation || !workspace || !isAbsolute(workspace) || !process.send) {
    throw new Error('Host worker requires IPC, generation and an absolute workspace');
  }
  if (bot && (resolve(bot.workspace) !== resolve(workspace) || process.env.MYAGENTS_HOST_SESSION_ID)) throw new Error('BOT_BOOTSTRAP_INVALID');
  let birthCredential: string | undefined;
  if (process.env.MYAGENTS_HOST_CREDENTIAL_SOURCE === 'supervisor-ipc') {
    initializationStage = 'credential';
    birthCredential = await new Promise<string | undefined>((resolveCredential, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Host credential initialization timed out')); }, 10_000);
      const onMessage = (raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const value = raw as Record<string, unknown>;
        if (value.type !== 'host-provider-snapshot') return;
        cleanup();
        if (Object.keys(value).length !== 4 || value.generation !== generation
          || !(bot?.cloud_model ? value.providerId === bot.provider_id : isHostProviderId(value.providerId)) || value.providerId !== process.env.MYAGENTS_HOST_PROVIDER_ID
          || !(value.credential === null || (typeof value.credential === 'string'
            && value.credential.trim().length > 0 && Buffer.byteLength(value.credential, 'utf8') <= 16 * 1024
            && !/[\r\n\0]/.test(value.credential)))) {
          reject(new Error('Host credential initialization is invalid')); return;
        }
        resolveCredential(value.credential === null ? undefined : value.credential as string);
      };
      const onDisconnect = () => { cleanup(); reject(new Error('Host supervisor disconnected')); };
      function cleanup() { clearTimeout(timer); process.off('message', onMessage); process.off('disconnect', onDisconnect); }
      process.on('message', onMessage); process.once('disconnect', onDisconnect);
      process.send?.({ type: 'credential-needed', generation }, undefined, undefined, (error: Error | null) => {
        if (error) { cleanup(); reject(new Error('Host credential initialization transport failed')); }
      });
    });
    if(bot?.cloud_model){
      if(!birthCredential)throw new Error('BOT_MODEL_CREDENTIAL_INVALID');
      installHostCloudModelCredential(bot.cloud_model,birthCredential);
    }else installHostSessionCredential(birthCredential, process.env.MYAGENTS_HOST_PROVIDER_ID);
  }
  const credentials = new Set<string>([process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN, process.env.CLAUDE_CODE_OAUTH_TOKEN].filter((value): value is string => Boolean(value)));
  if (birthCredential) credentials.add(birthCredential);
  birthCredential = undefined;
  const redactText = (text: string) => {
    for (const credential of credentials) text = text.split(credential).join('[redacted]');
    return text;
  };
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') return redactText(value);
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, /^(apiKey|apiKeys|providerApiKeys|providerEnvJson|accessToken|access_token|refreshToken|authorization)$/i.test(key) ? '[redacted]' : redact(item)]));
    return value;
  };
  // stdout is not a protocol channel; keep all upstream diagnostics on stderr.
  for (const name of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    console[name] = (...values: unknown[]) => { process.stderr.write(`${redactText(format(...values.map(redact)))}\n`); };
  }
  process.env.MYAGENTS_SIDECAR_ROLE = 'session';
  process.env.MYAGENTS_HOST_MODE = '1';
  process.env.MYAGENTS_RUNTIME = 'builtin';
  initializationStage = 'modules';
  const [{ getSessionEngine }, agent, store, config, routes] = await Promise.all([
    import('./session-engine'), import('./agent-session'), import('./SessionStore'),
    import('./utils/admin-config'), import('../shared/providerRoute'),
  ]);
  const engine = getSessionEngine();
  const existingId = process.env.MYAGENTS_HOST_SESSION_ID?.trim();
  const existing = existingId ? store.getSessionMetadata(existingId) : null;
  if (existingId && !existing) throw new Error('Host Session does not exist');
  if (existing && (existing.runtimeBindingCompatibility || (existing.runtime && existing.runtime !== 'builtin')
    || (existing.runtimeBinding && (existing.runtimeBinding.family !== 'integrated' || existing.runtimeBinding.id !== 'claude-agent-sdk')))) {
    throw new Error('Host worker only supports compatible builtin Sessions');
  }
  if (existing && resolve(existing.agentDir) !== resolve(workspace)) throw new Error('Session workspace does not match Host workspace');
  initializationStage = 'session';
  await agent.initializeAgent(workspace, undefined, existingId, { preWarmDisabled: true });
  if (engine.kind !== 'builtin') throw new Error('Host worker only supports builtin Sessions');
  if (!existing) {
    initializationStage = 'route';
    const model = bot?.model ?? process.env.MYAGENTS_HOST_MODEL?.trim();
    const providerId = bot?.provider_id ?? process.env.MYAGENTS_HOST_PROVIDER_ID?.trim();
    if (!model || !providerId) throw new Error('New Host Session requires an explicit Provider/model route');
    const remoteBirth = process.env.MYAGENTS_HOST_REMOTE_AGENT_BIRTH === '1' ? config.resolveWorkspaceConfig(workspace):undefined;
    const selectedRemoteModel=process.env.MYAGENTS_HOST_REMOTE_MODEL?.trim();
    const route = remoteBirth?.providerRoute
      ? selectedRemoteModel ? {...remoteBirth.providerRoute,model:selectedRemoteModel}:remoteBirth.providerRoute
      : routes.createConcreteProviderRoute(providerId, model);
    if (!routes.isConcreteProviderRoute(route) || route.providerId !== providerId || route.model !== model) throw new Error('Host Agent birth provider identity changed');
    const prepared = await engine.materializePendingDesktopSession({
      workspacePath: workspace, phase: 'prepare',
      ...(bot ? {birthSnapshot:{hostBotBinding:{botId:bot.snapshot.bot_id,runGeneration:bot.run_generation}}}:{}),
      snapshotPatch: { providerRoute: route, providerId, model, permissionMode: remoteBirth?.permissionMode ?? 'custom',
        mcpEnabledServers: remoteBirth?.mcpServers.map(item=>item.id) ?? [], ...(remoteBirth ? {}:{enabledPluginIds:[]}), enabledOfficialToolIds: remoteBirth?.enabledOfficialToolIds ?? [],
        ...(remoteBirth?.reasoningEffort ? {reasoningEffort:remoteBirth.reasoningEffort}:{}) },
    });
    if (!prepared.success || !prepared.sessionId) throw new Error('Host Session preparation failed');
    const committed = await engine.materializePendingDesktopSession({
      workspacePath: workspace, phase: 'commit', preparedSessionId: prepared.sessionId,
    });
    if (!committed.success) throw new Error('Host Session commit failed');
  }
  const boundSessionId = engine.getCurrentSessionContext().sessionId;
  if (!boundSessionId) throw new Error('Host Session binding is unavailable');
  const sessionId: string = boundSessionId;
  const workspacePath: string = workspace;
  if (bot) {
    const ownedMetadata=store.getSessionMetadata(sessionId);
    if (!ownedMetadata || !routes.isConcreteProviderRoute(ownedMetadata.providerRoute) || ownedMetadata.providerRoute.providerId!==bot.provider_id || ownedMetadata.providerRoute.model!==bot.model || resolve(ownedMetadata.agentDir)!==resolve(workspace)) throw new Error('BOT_RUN_BINDING_MISMATCH');
    if (ownedMetadata.hostBotBinding && (ownedMetadata.hostBotBinding.botId!==bot.snapshot.bot_id || ownedMetadata.hostBotBinding.runGeneration!==bot.run_generation)) throw new Error('BOT_RUN_BINDING_MISMATCH');
    // An old exact-owner birth may lack this marker; stamp only after checking
    // the protected bootstrap, actual engine binding, workspace and route.
    if (!ownedMetadata.hostBotBinding) await store.saveSessionMetadata({...ownedMetadata,hostBotBinding:{botId:bot.snapshot.bot_id,runGeneration:bot.run_generation}});
  }
  const transcript = store.getActiveSessionTranscript(sessionId);
  if (transcript && !await transcript.writer.flush()) throw new Error('Host Session birth could not be durably saved');
  // --no-pre-warm deliberately skips startup discovery. Recover configuration
  // from the owning snapshot, without replacing it with supervisor defaults.
  const metadata = store.getSessionMetadata(sessionId);
  initializationStage = 'restore';
  const restored = config.resolveWorkspaceConfig(workspace, metadata, { includeMcp: !bot });
  if (restored.providerEnv?.apiKey) credentials.add(restored.providerEnv.apiKey);
  if ((existing || bot) && metadata) await agent.restoreBuiltinConfigFromOwnedMetadata(metadata);
  // Restore the recorded permission mode for state inspection. A send below
  // still requires custom; a stronger recorded mode is never silently widened.
  await engine.updateMcpServers(bot ? [] : restored.mcpServers);
  await engine.updateEnabledPluginIds(bot ? [] : metadata?.enabledPluginIds ?? []);
  await engine.updateOfficialToolIds(bot ? [] : metadata?.enabledOfficialToolIds ?? []);
  if (restored.reasoningEffort) await engine.updateReasoningEffort(restored.reasoningEffort);
  const send = (message: HostSessionMessage) => { if (process.connected) process.send?.(redact(message)); };
  let loopbackBridge: Server | undefined;
  let cloudModelOutcomeUnknown=false;
  const ownerSources = new Map<string,{agentId:string;sessionId:string;root:string;relative:string;name:string;mimeType:string;sizeBytes:number;sha256:string;dev:number;ino:number;mtimeMs:number}>();
  async function ensureLoopbackBridge() {
    if (loopbackBridge) return;
    const [{createBridgeHandler},{lookupBridge,hasBridge},{registerBridgeSeedFn}]=await Promise.all([import('./openai-bridge'),import('./openai-bridge/bridge-registry'),import('./bridge-cache')]);
    const handler=createBridgeHandler({workspacePath:workspace,logger:null,getUpstreamConfig:async request=> {
      const token=new URL(request.url).pathname.match(/^\/bridge\/([^/]+)\/v1\/messages(?:\/count_tokens)?$/)?.[1];
      const cfg=token ? await lookupBridge(token,request) : undefined;
      if (!cfg) throw new Error('Host bridge token is unavailable');
      const aliases=cfg.modelAliases;
      const modelMapping=aliases ? (model:string)=> {
        if (!model.startsWith('claude')) return undefined;
        if (model.includes('fable')) return aliases.fable ?? cfg.model;
        if (model.includes('sonnet')) return aliases.sonnet ?? cfg.model;
        if (model.includes('opus')) return aliases.opus ?? cfg.model;
        if (model.includes('haiku')) return aliases.haiku ?? cfg.model;
        return cfg.model;
      } : undefined;
      return {...cfg,modelMapping};
    }});
    registerBridgeSeedFn(entries=>handler.seedThoughtSignatures(entries));
    const server=createServer(async (incoming,outgoing)=> {
      const abort=new AbortController();outgoing.once('close',()=>abort.abort());
      try {
        if (incoming.method !== 'POST' || !/^\/bridge\/[^/]+\/v1\/messages(?:\/count_tokens)?$/.test(new URL(incoming.url ?? '/', 'http://127.0.0.1').pathname)) {outgoing.writeHead(404).end();return;}
        if (bot?.cloud_model && (cloudModelOutcomeUnknown || rejectCloudModelRetry(bot.provider_id,incoming.headers['x-stainless-retry-count']))) {
          outgoing.writeHead(409,{'content-type':'application/json'}).end(JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'BOT_MODEL_RETRY_REJECTED'}}));return;
        }
        const buffers:Buffer[]=[];let length=0;
        for await (const chunk of incoming) {const bytes=Buffer.from(chunk);length+=bytes.length;if (length>16*1024*1024) {outgoing.writeHead(413).end();return;}buffers.push(bytes);}
        const headers=new Headers();for (const [key,value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key,Array.isArray(value)?value.join(','):value);
        const request=new Request(`http://127.0.0.1${incoming.url}`,{method:'POST',headers,body:Buffer.concat(buffers),signal:abort.signal});
        const countMatch=new URL(request.url).pathname.match(/^\/bridge\/([^/]+)\/v1\/messages\/count_tokens$/);
        if(countMatch){
          // Match the original sidecar count_tokens owner: OpenAI has no
          // equivalent endpoint, so this is a local estimate, never a turn.
          if(!hasBridge(countMatch[1])){outgoing.writeHead(400).end();return;}
          let estimate=1024;
          try{const value=await request.json() as {messages?:unknown[];system?:unknown;tools?:unknown[]};
            estimate=Math.max(1,Math.ceil((JSON.stringify(value.messages??[]).length+JSON.stringify(value.system??'').length+JSON.stringify(value.tools??[]).length)/4));
          }catch{/* The original owner uses a conservative estimate on malformed count input. */}
          outgoing.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({input_tokens:estimate}));return;
        }

        // Native SDK has an outer retry loop which may reset the HTTP retry
        // count. Once a sent cloud request has an uncertain outcome, close
        // this generation's model admission rather than charging it again.
        let response:Response;
        try{response=await handler(request);}catch{if(bot?.cloud_model)cloudModelOutcomeUnknown=true;throw new Error('Host bridge outcome is unconfirmed');}
        if(bot?.cloud_model&&response.status>=500)cloudModelOutcomeUnknown=true;
        outgoing.writeHead(response.status,Object.fromEntries(response.headers));
        if (response.body) {
          const body=Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
          body.once('error',()=>{if(bot?.cloud_model)cloudModelOutcomeUnknown=true;outgoing.destroy();});
          outgoing.once('close',()=>{if(bot?.cloud_model&&!outgoing.writableEnded)cloudModelOutcomeUnknown=true;});
          body.pipe(outgoing);
        }else outgoing.end();
      } catch {if (!outgoing.headersSent) outgoing.writeHead(502);outgoing.end();}
    });
    await new Promise<void>((yes,no)=> {server.once('error',no);server.listen(0,'127.0.0.1',()=>{server.off('error',no);yes();});});
    const address=server.address();if (!address || typeof address === 'string') {server.close();throw new Error('Host loopback bridge is unavailable');}
    loopbackBridge=server;agent.setSidecarPort(address.port);
  }
  let closing = false;
  let serial = Promise.resolve();
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await engine.stopTurn();
    await store.drainSessionTranscripts();
    loopbackBridge?.closeAllConnections();
    if (loopbackBridge) await new Promise<void>(resolveClose=>loopbackBridge!.close(()=>resolveClose()));
  };
  async function operate(request: HostSessionRequest): Promise<unknown> {
    const args = request.args ?? {};
    switch (request.operation) {
      case 'asset-owner': {
        if(bot)throw new Error('REMOTE_SESSION_PRIVATE');
        if(args.sessionId!==sessionId||typeof args.agentId!=='string')throw new Error('REMOTE_ASSET_OWNER_CHANGED');
        validateRemoteAgent(args.agentId);
        if(args.kind==='list'){
          if(!Number.isSafeInteger(args.limit)||Number(args.limit)<1||Number(args.limit)>30||(args.before!==undefined&&(typeof args.before!=='string'||args.before.length>256)))throw new Error('REMOTE_ASSET_REQUEST_INVALID');
          const resolver=await import('./remote-session/assets');
          const page=await resolver.resolveDesktopRemoteArtifacts({agentId:args.agentId,sessionId,limit:args.limit,before:args.before});
          if(!page.success)throw new Error(page.code);
          const items=[];
          for(const item of page.data.items){
            if(!item.root||!item.relative||isAbsolute(item.relative)||item.relative.split(sep).some(part=>!part||part==='.'||part==='..'))throw new Error('REMOTE_ARTIFACT_UNAVAILABLE');
            const absolute=join(item.root,item.relative),canonical=await realpath(absolute),stat=await lstat(absolute);
            if(canonical!==absolute||!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1||stat.size>20*1024*1024)throw new Error('REMOTE_ARTIFACT_UNAVAILABLE');
            const root=await realpath(item.root);if(root!==item.root||!absolute.startsWith(root+sep))throw new Error('REMOTE_ARTIFACT_UNAVAILABLE');
            const fd=await open(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const digest=createHash('sha256'),buffer=Buffer.alloc(24*1024);let offset=0;
            try{while(offset<stat.size){const read=await fd.read(buffer,0,Math.min(buffer.length,stat.size-offset),offset);if(!read.bytesRead)throw new Error('REMOTE_ARTIFACT_CHANGED');digest.update(buffer.subarray(0,read.bytesRead));offset+=read.bytesRead;}}
            finally{buffer.fill(0);await fd.close();}
            const sha256=digest.digest('hex');const sourceId=createHash('sha256').update(JSON.stringify([args.agentId,sessionId,absolute,sha256])).digest('hex').slice(0,32).replace(/^(.{12})./,(_,a)=>`${a}4`).replace(/^(.{16})(.)/,(_,a,b)=>`${a}${((parseInt(b,16)&3)|8).toString(16)}`).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
            ownerSources.set(sourceId,{agentId:args.agentId,sessionId,root:item.root,relative:item.relative,name:item.name,mimeType:item.mimeType,sizeBytes:stat.size,sha256,dev:stat.dev,ino:stat.ino,mtimeMs:stat.mtimeMs});
            while(ownerSources.size>256)ownerSources.delete(ownerSources.keys().next().value!);
            items.push({sourceId,name:item.name,mimeType:item.mimeType,sizeBytes:stat.size,sha256});
          }
          return {kind:'owner-page',agentId:args.agentId,sessionId,items,hasMore:page.data.hasMore,nextBefore:page.data.nextBefore};
        }
        if(args.kind==='read'){
          if(typeof args.sourceId!=='string'||!Number.isSafeInteger(args.offset)||!Number.isSafeInteger(args.maxBytes)||Number(args.maxBytes)<1||Number(args.maxBytes)>24*1024)throw new Error('REMOTE_ASSET_REQUEST_INVALID');
          const entry=ownerSources.get(args.sourceId);if(!entry||entry.agentId!==args.agentId||entry.sessionId!==sessionId)throw new Error('REMOTE_ASSET_NOT_FOUND');
          if(Number(args.offset)<0||Number(args.offset)>entry.sizeBytes)throw new Error('REMOTE_ASSET_RANGE_INVALID');
          const absolute=join(entry.root,entry.relative);if(await realpath(absolute)!==absolute)throw new Error('REMOTE_ARTIFACT_CHANGED');
          const before=await lstat(absolute);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.dev!==entry.dev||before.ino!==entry.ino||before.size!==entry.sizeBytes||before.mtimeMs!==entry.mtimeMs)throw new Error('REMOTE_ARTIFACT_CHANGED');
          const fd=await open(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const stat=await fd.stat();if(stat.dev!==entry.dev||stat.ino!==entry.ino||stat.size!==entry.sizeBytes||stat.mtimeMs!==entry.mtimeMs)throw new Error('REMOTE_ARTIFACT_CHANGED');const data=Buffer.alloc(Math.min(Number(args.maxBytes),entry.sizeBytes-Number(args.offset)));const result=await fd.read(data,0,data.length,Number(args.offset));if(result.bytesRead!==data.length)throw new Error('REMOTE_ARTIFACT_CHANGED');const after=await fd.stat();if(after.dev!==entry.dev||after.ino!==entry.ino||after.size!==entry.sizeBytes||after.mtimeMs!==entry.mtimeMs)throw new Error('REMOTE_ARTIFACT_CHANGED');return {kind:'owner-chunk',sourceId:args.sourceId,offset:Number(args.offset),dataBase64:data.toString('base64'),sha256:createHash('sha256').update(data).digest('hex'),eof:Number(args.offset)+data.length===entry.sizeBytes};}finally{await fd.close();}
        }
        throw new Error('REMOTE_ASSET_REQUEST_INVALID');
      }
      case 'mobile-suggestions': {
        if(bot||typeof args.agentId!=='string'||args.sessionId!==sessionId||typeof args.revision!=='string'||args.revision.length>128)throw new Error('REMOTE_MOBILE_REQUEST_INVALID');
        validateRemoteAgent(args.agentId);
        const [{buildRemoteSnapshot},{suggestNextPrompt}]=await Promise.all([import('./remote-session/projection'),import('./session-prompt-suggestion')]);
        const before=await buildRemoteSnapshot(args.agentId,sessionId,generation!,30);
        if(before.revision!==args.revision)throw new Error('REMOTE_MOBILE_REVISION_CHANGED');
        const anchor=before.messages.at(-1);if(!anchor||anchor.role!=='assistant')throw new Error('REMOTE_MOBILE_SUGGESTIONS_UNAVAILABLE');
        const suggestion=await suggestNextPrompt(engine,{sessionId,anchorMessageId:anchor.id});
        if((await buildRemoteSnapshot(args.agentId,sessionId,generation!,30)).revision!==args.revision)throw new Error('REMOTE_MOBILE_REVISION_CHANGED');
        if(suggestion.availability!=='supported'||suggestion.suggestion&&suggestion.suggestion.length>512)throw new Error('REMOTE_MOBILE_SUGGESTIONS_UNAVAILABLE');
        return {kind:'mobile.suggestions',version:1,agentId:args.agentId,sessionId,revision:args.revision,suggestions:suggestion.suggestion?[suggestion.suggestion]:[]};
      }
      case 'mobile-send': {
        if(bot||typeof args.agentId!=='string'||args.sessionId!==sessionId||typeof args.operationId!=='string'||! /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(args.operationId)||typeof args.text!=='string'||args.text.length>16000||!Array.isArray(args.assets)||args.assets.length>8)throw new Error('REMOTE_MOBILE_REQUEST_INVALID');
        if(args.modelId!==undefined&&(typeof args.modelId!=='string'||args.modelId.length<1||args.modelId.length>256||/[\p{Cc}]/u.test(args.modelId)))throw new Error('REMOTE_MOBILE_MODEL_UNAVAILABLE');
        if(typeof args.expectedObservation!=='string'||!/^[0-9a-f]{64}$/.test(args.expectedObservation))throw new Error('REMOTE_SESSION_OWNER_CHANGED');
        if(process.env.MYAGENTS_HOST_EXECUTION_AUTHORIZED!=='1')throw new Error('REMOTE_SESSION_EXECUTION_NOT_AUTHORIZED');
        validateRemoteAgent(args.agentId);
        const {imSnapshotObservation}=await import('./routes/im-model-selection');
        const ownedMetadata=store.getSessionMetadata(sessionId);
        if(!ownedMetadata||imSnapshotObservation(ownedMetadata)!==args.expectedObservation)throw new Error('REMOTE_SESSION_OWNER_CHANGED');
        const stageRoot=process.env.MYAGENTS_HOST_ASSET_STAGING_ROOT;if(args.assets.length>0&&(!stageRoot||await realpath(stageRoot)!==stageRoot))throw new Error('REMOTE_MOBILE_ASSET_UNAVAILABLE');
        const images:import('./runtimes/types').ImagePayload[]=[],refs:string[]=[];
        for(const raw of args.assets){
          if(!stageRoot)throw new Error('REMOTE_MOBILE_ASSET_UNAVAILABLE');
          if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('REMOTE_MOBILE_ASSET_INVALID');
          const asset=raw as Record<string,unknown>;
          if(typeof asset.assetId!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(asset.assetId)||typeof asset.sourcePath!=='string'||typeof asset.name!=='string'||typeof asset.mimeType!=='string'||typeof asset.sha256!=='string'||!/^[0-9a-f]{64}$/.test(asset.sha256)||!Number.isSafeInteger(asset.sizeBytes)||Number(asset.sizeBytes)<1||Number(asset.sizeBytes)>20*1024*1024)throw new Error('REMOTE_MOBILE_ASSET_INVALID');
          const rel=relative(stageRoot,asset.sourcePath);const parts=rel.split(sep);if(resolve(asset.sourcePath)!==asset.sourcePath||parts.length!==2||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(parts[0])||parts[1]!=='data'||await realpath(asset.sourcePath)!==asset.sourcePath)throw new Error('REMOTE_MOBILE_ASSET_INVALID');
          const info=await lstat(asset.sourcePath);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size!==asset.sizeBytes)throw new Error('REMOTE_MOBILE_ASSET_INVALID');
          const bytes=await readFile(asset.sourcePath);if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('REMOTE_MOBILE_ASSET_HASH_MISMATCH');
          if(isImageMimeType(asset.mimeType)){
            if(bytes.length>USER_IMAGE_ATTACHMENT_MAX_BYTES)throw new Error('REMOTE_MOBILE_ASSET_SIZE_LIMIT');
            const detected=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':/^GIF8[79]a/.test(bytes.subarray(0,6).toString('ascii'))?'image/gif':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
            if(!detected||detected!==(asset.mimeType==='image/jpg'?'image/jpeg':asset.mimeType))throw new Error('REMOTE_MOBILE_ASSET_MIME_MISMATCH');
            const attachmentRoot=store.getAttachmentPath('');await mkdir(attachmentRoot,{recursive:true,mode:0o700});const canonicalRoot=await realpath(attachmentRoot);
            await mkdir(join(canonicalRoot,sessionId),{recursive:true,mode:0o700});const filename=`${args.operationId}-${asset.assetId}.${asset.mimeType==='image/jpeg'||asset.mimeType==='image/jpg'?'jpeg':asset.mimeType.slice(6)}`;const file=join(canonicalRoot,sessionId,filename);if(await realpath(dirname(file))!==join(canonicalRoot,sessionId))throw new Error('REMOTE_MOBILE_ASSET_UNAVAILABLE');
            const fd=await open(file,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
            images.push({kind:'attachment_ref',id:asset.assetId,name:asset.name,mimeType:asset.mimeType,sizeBytes:Number(asset.sizeBytes),relativePath:`${sessionId}/${filename}`});
          }else{
            if(asset.mimeType==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('REMOTE_MOBILE_ASSET_MIME_MISMATCH');
            if(asset.mimeType.startsWith('text/')){if(bytes.includes(0))throw new Error('REMOTE_MOBILE_ASSET_MIME_MISMATCH');try{new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new Error('REMOTE_MOBILE_ASSET_MIME_MISMATCH');}}
            const workspaceRoot=await realpath(workspacePath);const folder=join(workspaceRoot,'myagents_files','remote-mobile',sessionId,args.operationId);await mkdir(folder,{recursive:true,mode:0o700});if(await realpath(folder)!==folder||!folder.startsWith(workspaceRoot+sep))throw new Error('REMOTE_MOBILE_ASSET_UNAVAILABLE');
            const suffix=extname(asset.name).slice(1).toLowerCase();const filename=`${asset.assetId}${/^[a-z0-9]{1,12}$/.test(suffix)?'.'+suffix:''}`;const file=join(folder,filename);const fd=await open(file,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()};refs.push(`@myagents_files/remote-mobile/${sessionId}/${args.operationId}/${filename}`);
          }
          bytes.fill(0);
        }
        const text=[args.text,...refs].filter(Boolean).join('\n');if(!text&&images.length===0)throw new Error('A bounded non-empty text is required');
        return operate({...request,operation:'send',args:{text,images,clientRequestId:args.operationId,remote:true,remoteMobile:true,remoteObservation:args.expectedObservation,remoteAgentId:args.agentId,...(typeof args.modelId==='string'?{modelId:args.modelId}:{})}});
      }
      case 'remote': {
        if (bot) throw new Error('REMOTE_SESSION_PRIVATE');
        const remote = remoteSessionRequestSchema.parse(args.remoteSession);
        if (!('sessionId' in remote) || remote.sessionId !== sessionId) throw new Error('REMOTE_SESSION_TARGET_CHANGED');
        if (remote.kind === 'get') {
          const { buildRemoteSnapshot } = await import('./remote-session/projection');
          return buildRemoteSnapshot(remote.agentId, sessionId, generation!, remote.limit, remote.before);
        }
        if (remote.kind === 'send') {
          if (process.env.MYAGENTS_HOST_EXECUTION_AUTHORIZED !== '1') throw new Error('REMOTE_SESSION_EXECUTION_NOT_AUTHORIZED');
          validateRemoteAgent(remote.agentId);
          return operate({ ...request, operation: 'send', args: {text: remote.text, clientRequestId: remote.operationId,remote:true,remoteAgentId:remote.agentId} });
        }
        if (remote.kind === 'respond' || remote.kind === 'stop') {
          if (remote.generation !== generation || remote.turnId !== engine.getExecutionTurnId()) throw new Error('REMOTE_SESSION_INTERACTION_EXPIRED');
          validateRemoteAgent(remote.agentId);
          if (remote.kind === 'stop') return operate({...request,operation:'stop',args:{queueId:remote.turnId}});
          const { buildRemoteSnapshot } = await import('./remote-session/projection');
          const snapshot = await buildRemoteSnapshot(remote.agentId, sessionId, generation!, 1);
          const interaction=snapshot.interactions.find(item => item.requestId === remote.requestId && item.interaction === remote.interaction && item.generation === remote.generation && item.turnId === remote.turnId);
          if (!interaction || (remote.approved && !interaction.actionable)) throw new Error('REMOTE_SESSION_INTERACTION_EXPIRED');
          if (remote.interaction === 'question' && remote.approved && (!remote.answers || interaction.questions.some(question=>!remote.answers?.[question.answerKey]?.trim()) || Object.keys(remote.answers).some(key=>!interaction.questions.some(question=>question.answerKey===key)))) throw new Error('REMOTE_SESSION_ANSWERS_INVALID');
          return operate({...request,operation:'permission',args:{requestId:remote.requestId,kind:remote.interaction,
            approved:remote.approved,decision:remote.approved ? 'allow_once':'deny',answers:remote.approved ? remote.answers ?? {} : null}});
        }
        throw new Error('REMOTE_SESSION_OPERATION_UNSUPPORTED');
      }
      case 'describe': return { sessionId, workspacePath: workspace, runtime: 'builtin',
        executionAuthorized: bot?.cloud_model ? bot.cloud_model.expires_at > Date.now()/1000 : process.env.MYAGENTS_HOST_EXECUTION_AUTHORIZED === '1',
        supportedProviderProtocols: ['anthropic','openai'], unsupportedCapabilities: ['agent-network', 'task', 'goal', 'browser-host', 'cross-session-inbox'],
        config: engine.getSessionConfigSnapshot() };
      case 'state': return { sessionId, ...engine.getLiveSessionState(),
        queueId: engine.getExecutionTurnId(), replay: engine.getStreamReplaySnapshot(), terminal: engine.getSessionCompletionTerminal() };
      case 'result': return { ...await engine.getLatestAssistantResult(), terminal: engine.getSessionCompletionTerminal() };
      case 'send': {
        if (bot && !bot.cloud_model) throw new Error('Delegated Bot v1 supports lifecycle only; model invocation is not authorized');
        if (!bot?.cloud_model && process.env.MYAGENTS_HOST_EXECUTION_AUTHORIZED !== '1') throw new Error('Model execution requires explicit Host execution authorization');
        const mobileImages=args.remote===true?validateMobileImages(args.images,sessionId):undefined;
        if (typeof args.text !== 'string' || (!args.text.trim()&&!mobileImages?.length) || args.text.length > 100_000) throw new Error('A bounded non-empty text is required');
        if(bot?.cloud_model)resolveHostCloudModelProvider(bot.provider_id,bot.model);
        const snapshot = store.getSessionMetadata(sessionId);
        if (!routes.isConcreteProviderRoute(snapshot?.providerRoute)) throw new Error('Session Provider/model route is unavailable');
        const selectedModel=args.remoteMobile===true&&typeof args.modelId==='string'?args.modelId:undefined;
        if(selectedModel&&snapshot.providerRoute.kind!=='provider')throw new Error('REMOTE_MOBILE_MODEL_UNAVAILABLE');
        const providerRoute=selectedModel&&snapshot.providerRoute.kind==='provider'?{...snapshot.providerRoute,model:selectedModel}:snapshot.providerRoute;
        const provider = config.materializeProviderRouteEnv(providerRoute);
        if (provider?.apiKey) credentials.add(provider.apiKey);
        if (provider?.apiProtocol === 'openai') await ensureLoopbackBridge();
        if (snapshot.providerRoute.kind === 'provider' && !provider) throw new Error('Session Provider credential is unavailable');
        if(args.remoteMobile===true){
          if(typeof args.remoteObservation!=='string'||!/^[0-9a-f]{64}$/.test(args.remoteObservation))throw new Error('REMOTE_SESSION_OWNER_CHANGED');
          const {imSnapshotObservation}=await import('./routes/im-model-selection');
          if(imSnapshotObservation(snapshot)!==args.remoteObservation)throw new Error('REMOTE_SESSION_OWNER_CHANGED');
        }
        const autoRouteSnapshotAdmission = args.remoteMobile === true
          ? (await import('./remote-session/auto-route-admission')).createRemoteAutoRouteSnapshotAdmission({
            initial: snapshot, observation: args.remoteObservation as string,
            observe: (await import('./routes/im-model-selection')).imSnapshotObservation,
            current: () => store.getSessionMetadata(sessionId),
            isOwnerCurrent: () => {
              const current = engine.getCurrentSessionContext();
              return !closing && process.env.MYAGENTS_HOST_GENERATION === generation
                && current.sessionId === sessionId && !!current.workspacePath
                && resolve(current.workspacePath) === resolve(workspacePath);
            },
          }) : undefined;
        const result = await engine.sendDesktopMessage({
          text: args.text, images: mobileImages, sessionId, workspacePath, scenario: { type: 'desktop' },
          providerRoute, ...(selectedModel?{model:selectedModel}:{}), permissionMode: args.remote === true ? snapshot.permissionMode ?? 'custom':'custom',
          clientRequestId: typeof args.clientRequestId === 'string' ? args.clientRequestId : randomUUID(), turnBoundaryOnly: true,
          autoRouteSnapshotAdmission,
          beforeDispatch: async () => {
            if (typeof args.remoteAgentId==='string') {
              try {validateRemoteAgent(args.remoteAgentId);} catch {return {accepted:false,error:'REMOTE_SESSION_AGENT_UNAVAILABLE'};}
            }
            if (autoRouteSnapshotAdmission) {
              const current = store.getSessionMetadata(sessionId);
              if (!current || !autoRouteSnapshotAdmission.isCurrent(current)) return { accepted: false, error: 'REMOTE_SESSION_OWNER_CHANGED' };
            }
            return { accepted: !closing, ...(closing ? { error: 'Host worker is shutting down' } : {}) };
          },
          onTerminal: outcome => { send({ type: 'terminal', generation: generation!, sessionId, outcome }); },
        });
        return settleHostSessionAdmission(args.remote===true,result);
      }
      case 'permission': {
        if (typeof args.requestId !== 'string') throw new Error('Permission requestId is required');
        let accepted: boolean;
        if (args.kind === 'question') {
          if (args.answers !== null && (typeof args.answers !== 'object' || Array.isArray(args.answers))) throw new Error('Question answers are required');
          accepted = await engine.respondAskUserQuestion(args.requestId, args.answers as Parameters<typeof engine.respondAskUserQuestion>[1]);
        } else if (args.kind === 'plan') {
          if (typeof args.approved !== 'boolean') throw new Error('Plan approval must be explicit');
          accepted = await engine.respondPlanApproval(args.requestId, args.approved, typeof args.feedback === 'string' ? args.feedback : undefined);
        } else {
          if (args.decision !== 'deny' && args.decision !== 'allow_once') throw new Error('Permission decision must be deny or allow_once');
          accepted = await engine.respondPermission(args.requestId, args.decision);
        }
        if (!accepted) throw new Error('Interactive request is no longer pending');
        return { accepted };
      }
      case 'stop': {
        if (args.queueId !== undefined && args.queueId !== engine.getExecutionTurnId()) throw new Error('Session stop target is no longer active');
        return engine.stopTurn();
      }
      case 'shutdown': await shutdown(); return { stopped: true };
    }
  }
  function validateRemoteAgent(agentId:string):void {
    assertOrdinaryRemoteAgent(agentId,config.loadConfig({strict:true}).hostBotDelegationsV1);
    const registered=config.findProjectAgentByWorkspacePath(workspace!);
    const project=config.loadProjects({strict:true}).find(item=>item.agentId===agentId);
    if (!registered || registered.id!==agentId || !registered.enabled || !project || !isProjectVisibleToUser(project) || isProjectArchived(project) || resolve(project.path)!==resolve(workspace!)) throw new Error('REMOTE_SESSION_AGENT_UNAVAILABLE');
  }
  function validateMobileImages(value:unknown,boundSessionId:string):import('./runtimes/types').ImagePayload[]|undefined {
    if(value===undefined)return undefined;
    if(!Array.isArray(value)||value.length>8)throw new Error('REMOTE_MOBILE_ASSET_INVALID');
    return value.map(raw=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('REMOTE_MOBILE_ASSET_INVALID');
      const image=raw as Record<string,unknown>;
      if(Object.keys(image).some(key=>!['kind','id','name','mimeType','sizeBytes','relativePath'].includes(key))||image.kind!=='attachment_ref'||typeof image.id!=='string'||typeof image.name!=='string'||typeof image.mimeType!=='string'||!isImageMimeType(image.mimeType)||!Number.isSafeInteger(image.sizeBytes)||Number(image.sizeBytes)<1||Number(image.sizeBytes)>USER_IMAGE_ATTACHMENT_MAX_BYTES||typeof image.relativePath!=='string')throw new Error('REMOTE_MOBILE_ASSET_INVALID');
      const pieces=image.relativePath.split('/');if(pieces.length!==2||pieces[0]!==boundSessionId||pieces.some(piece=>!piece||piece==='.'||piece==='..'||piece.includes('\\')))throw new Error('REMOTE_MOBILE_ASSET_INVALID');
      return image as unknown as import('./runtimes/types').ImagePayload;
    });
  }
  process.on('message', (value: unknown) => {
    if (!isHostSessionRequest(value)) return;
    if (value.generation !== generation) {
      send({ type: 'reply', generation: generation!, id: value.id, ok: false, error: 'Stale Host generation' });
      return;
    }
    const handle = async () => {
      if (closing) { send({ type: 'reply', generation: generation!, id: value.id, ok: false, error: 'Host worker is shutting down' }); return; }
      try {
        const data = await operate(value);
        send({ type: 'reply', generation: generation!, id: value.id, ok: true, data });
        if (value.operation === 'shutdown') setImmediate(() => process.exit(0));
      } catch (error) {
        // Only this entry's fixed validation messages may cross IPC. Provider
        // and SDK errors may carry bearer material and remain server diagnostics.
        const message = error instanceof Error ? error.message : '';
        const safe = /^(REMOTE_(?:SESSION|MOBILE|ASSET)_[A-Z_]+$|BOT_MODEL_NOT_AUTHORIZED$|Delegated Bot v1|Model execution requires|A bounded|Session Provider|OpenAI protocol requires|Session message admission|Session dispatch|Permission |Question |Plan |Interactive )/.test(message);
        send({ type: 'reply', generation: generation!, id: value.id, ok: false, error: safe ? message : 'Host Session operation failed; inspect worker diagnostics' });
      }
    };
    // Human responses and Stop must remain reachable while a send is waiting
    // for dispatch admission; serializing them behind that promise deadlocks.
    if (value.operation === 'send' || value.operation === 'mobile-send' || (value.operation === 'remote' && (value.args?.remoteSession as {kind?:unknown}|undefined)?.kind === 'send')) serial = serial.then(handle);
    else void handle();
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void shutdown().finally(() => process.exit(0)); });
  process.on('disconnect', () => { void shutdown().finally(() => process.exit(0)); });
  send({ type: 'ready', generation, sessionId, ...(bot ? {bot: {bot_id: bot.snapshot.bot_id, agent_id: bot.snapshot.agent_id, binding_generation: bot.snapshot.binding_generation, session_id: sessionId, run_generation: bot.run_generation, snapshot_hash: bot.snapshot.snapshot_hash, runtime: 'builtin' as const}} : {}) });
}

void main().catch(() => { process.stderr.write(`Host Session worker initialization failed (${initializationStage})\n`); process.exit(1); });
