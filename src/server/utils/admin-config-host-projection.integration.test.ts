import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {findEffectiveProvider,resolveWorkspaceConfig} from './admin-config';
import type {SessionMetadata} from '../types/session';

let home:string|undefined;
afterEach(()=>{vi.unstubAllEnvs();if(home)rmSync(home,{recursive:true,force:true});home=undefined});
it('projects original Host routes without materializing worker-only credentials or legacy secrets',()=>{
 home=mkdtempSync(join(tmpdir(),'host-config-projection-'));mkdirSync(join(home,'.myagents'));
 vi.stubEnv('HOME',home);vi.stubEnv('USERPROFILE',home);vi.stubEnv('MYAGENTS_HOST_MODE','1');
 const provider=findEffectiveProvider('moonshot-coding',{});expect(provider).toBeDefined();
 const model=String(provider!.primaryModel);
 const config={defaultProviderId:'moonshot-coding',providerApiKeys:{'moonshot-coding':'host-provider-credential:moonshot-coding'},agents:[{id:'agent',name:'Fixture',enabled:true,runtime:'builtin',providerId:'moonshot-coding',model}]};
 writeFileSync(join(home,'.myagents','config.json'),JSON.stringify(config),{mode:0o600});
 writeFileSync(join(home,'.myagents','projects.json'),JSON.stringify([{id:'project',name:'Fixture',path:'/workspace',agentId:'agent'}]),{mode:0o600});
 // The supervisor does not have the private birth snapshot, and must not resolve it.
 expect(()=>resolveWorkspaceConfig('/workspace',undefined,{includeMcp:false})).toThrow('Host credential reference is unavailable');
 const projected=resolveWorkspaceConfig('/workspace',undefined,{includeMcp:false,includeProviderEnv:false});
 expect(projected.providerRoute).toMatchObject({kind:'provider',providerId:'moonshot-coding',model});
 expect(projected.providerEnv).toBeUndefined();
 const snapshot={id:'session',configSnapshotAt:'2026-10-18T00:00:00Z',providerId:'moonshot-coding',model,providerRoute:projected.providerRoute,permissionMode:'plan'} as SessionMetadata;
 expect(resolveWorkspaceConfig('/workspace',snapshot,{includeMcp:false,includeProviderEnv:false})).toMatchObject({providerRoute:projected.providerRoute,permissionMode:'plan',providerEnv:undefined});
 const legacy={...snapshot,providerId:undefined,providerRoute:undefined,model:undefined,providerEnvJson:JSON.stringify({apiKey:'private-legacy-snapshot'})};
 expect(resolveWorkspaceConfig('/workspace',legacy,{includeMcp:false,includeProviderEnv:false}).providerEnv).toBeUndefined();
 // Execution callers retain the original refusal until the worker installs its snapshot.
 expect(()=>resolveWorkspaceConfig('/workspace',snapshot,{includeMcp:false})).toThrow('Host credential reference is unavailable');
});
