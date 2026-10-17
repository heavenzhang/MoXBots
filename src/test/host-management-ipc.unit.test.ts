import { describe, expect, it } from 'vitest';
import { parseInternalManagementRequest } from '../host/management-ipc';

const authority = {
  connection:{serviceId:'service',networkId:'network',bootEpoch:'boot',connectionEpoch:'connection'},
  peer:{serviceId:'service',environment:'production',networkId:'network',principalId:'peer-principal',deviceId:'peer-device',keyGeneration:3},
  peerEpoch:'peer-epoch',
  local:{serviceId:'service',environment:'production',networkId:'network',principalId:'host-principal',deviceId:'host-device',keyGeneration:4},
  accountBinding:'binding-1',managementBinding:'binding-1',
};

describe('private Host management envelope',()=>{
  it('accepts only the expected local device and a closed typed operation',()=>{
    const value={kind:'internal-request',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',authority,
      operation:{kind:'mobile.request',request:{kind:'mobile.send',version:1,agentId:'agent-1',sessionId:'session-1',operationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',text:'hello',assetIds:[]}}};
    expect(parseInternalManagementRequest(value,'host-device')).not.toBeNull();
    expect(parseInternalManagementRequest(value,'other-device')).toBeNull();
    expect(parseInternalManagementRequest({...value,extra:true},'host-device')).toBeNull();
    expect(parseInternalManagementRequest({...value,operation:{...value.operation,arbitraryPath:'/tmp/file'}},'host-device')).toBeNull();
  });

  it('rejects account rebinding and mismatched network authority',()=>{
    const value={kind:'internal-request',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',authority,
      operation:{kind:'asset.stage.finish',agentId:'agent-1',sessionId:'session-1',assetId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}};
    expect(parseInternalManagementRequest({...value,authority:{...authority,managementBinding:'binding-2'}},'host-device')).toBeNull();
    expect(parseInternalManagementRequest({...value,authority:{...authority,peer:{...authority.peer,networkId:'foreign'}}},'host-device')).toBeNull();
  });

  it('caps decoded staging chunks at 24 KiB',()=>{
    const base={kind:'internal-request',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',authority,
      operation:{kind:'asset.stage.chunk',agentId:'agent-1',sessionId:'session-1',assetId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',offset:0,sha256:'a'.repeat(64)}};
    expect(parseInternalManagementRequest({...base,operation:{...base.operation,dataBase64:Buffer.alloc(24*1024).toString('base64')}},'host-device')).not.toBeNull();
    expect(parseInternalManagementRequest({...base,operation:{...base.operation,dataBase64:Buffer.alloc(24*1024+1).toString('base64')}},'host-device')).toBeNull();
  });
});
