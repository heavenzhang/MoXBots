/** Isolated local operator setup. Never creates Session metadata or terminal events. */
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const [workspace, baseUrl] = process.argv.slice(2);
if (!workspace || !baseUrl || new URL(baseUrl).hostname !== '127.0.0.1') throw Error('FIXTURE_LOOPBACK_REQUIRED');
const {handleModelAdd} = await import('../../server/admin-api');
const {atomicModifyConfig,saveCustomProviderFile} = await import('../../server/utils/admin-config');
const added = await handleModelAdd({dryRun:true,provider:{id:'original-host-fixture',name:'Original Host local fixture',baseUrl,
  authType:'api_key',models:['original-host-model'],primaryModel:'original-host-model'}});
if (!added.success) throw Error('FIXTURE_PROVIDER_SETUP_FAILED');
// The isolated Host has no desktop-wide invalidation server. Persist the
// original validated definition through its existing local operator writer.
await saveCustomProviderFile(added.preview as Record<string,unknown>&{id:string});
await atomicModifyConfig(config => ({...config, providerApiKeys:{...config.providerApiKeys,'original-host-fixture':'host-provider-credential:original-host-fixture'}, agents:[{id:'original-host-agent',name:'Original Host fixture',enabled:true,
  channels:[],runtime:'builtin',providerId:'original-host-fixture',model:'original-host-model',permissionMode:'custom'}]}));
const directory = join(process.env.HOME!, '.myagents');
await mkdir(directory,{recursive:true,mode:0o700});
await writeFile(join(directory,'projects.json'),JSON.stringify([{id:'original-host-project',name:'Original Host fixture',path:workspace,agentId:'original-host-agent'}]),{mode:0o600});
console.log('LOCAL_OPERATOR_READY');
