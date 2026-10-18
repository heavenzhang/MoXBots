import { describe,it,expect,vi } from 'vitest';
import { admitHeadlessMobileStart } from '../host/headless-mobile-start';
import type { RemoteMobileRequest } from '../shared/remoteMobile';

const request:Extract<RemoteMobileRequest,{kind:'mobile.start'}>={version:1,kind:'mobile.start',agentId:'agent-a',operationId:'11111111-1111-4111-8111-111111111111',text:'hello',assetIds:[],modelId:'catalog/model-a'};

describe('headless mobile.start original Host admission',()=>{
 it('records the original start before ensuring and dispatching its Host session',async()=>{
  const order:string[]=[];
  const result=await admitHeadlessMobileStart({request,manifestHash:'a'.repeat(64),
   begin:async value=>{expect(value).toBe(request);order.push('begin');return {fresh:true}},
   read:async()=>{order.push('read');return {status:'processing'}},
   ensure:async(agentId,modelId)=>{expect([agentId,modelId]).toEqual(['agent-a','catalog/model-a']);order.push('ensure');return {target:'worker',sessionId:'session-1'}},
   adopt:async(value,id,hash)=>{expect(value).toBe(request);expect(id).toBe('session-1');expect(hash).toBe('a'.repeat(64));order.push('adopt');return true},
   dispatch:async(target,id,value)=>{expect([target,id,value]).toEqual(['worker','session-1',request]);order.push('dispatch');return {accepted:true}},
   finish:async(value,status,id,code)=>{expect([value,status,id,code]).toEqual([request,'accepted','session-1',null]);order.push('finish');return {status}},
   releaseObservation:vi.fn(),
  });
  expect(result.status).toBe('accepted');expect(order).toEqual(['begin','ensure','adopt','dispatch','finish']);
 });

 it('does not create or dispatch a second session for an existing operation',async()=>{
  const ensure=vi.fn(),dispatch=vi.fn();
  const result=await admitHeadlessMobileStart({request,manifestHash:'b'.repeat(64),begin:async()=>({fresh:false}),read:async(value,hash)=>{expect(value).toBe(request);expect(hash).toBe('b'.repeat(64));return {status:'processing'}},ensure,adopt:vi.fn(),dispatch,finish:vi.fn(),releaseObservation:vi.fn()});
  expect(result.status).toBe('processing');expect(ensure).not.toHaveBeenCalled();expect(dispatch).not.toHaveBeenCalled();
 });

 it('keeps a lost Host dispatch unresolved and never retries it',async()=>{
  const dispatch=vi.fn(async()=>{throw new Error('worker transport failed')});
  const finish=vi.fn();let reads=0;
  const releaseObservation=vi.fn(async()=>{});
  const result=await admitHeadlessMobileStart({request,manifestHash:'c'.repeat(64),begin:async()=>({fresh:true}),read:async()=>{reads++;expect(releaseObservation).toHaveBeenCalledOnce();return {status:'unconfirmed'}},ensure:async()=>({target:'worker',sessionId:'session-2'}),adopt:async()=>true,dispatch,finish,releaseObservation});
  expect(result.status).toBe('unconfirmed');expect(reads).toBe(1);expect(dispatch).toHaveBeenCalledTimes(1);expect(finish).not.toHaveBeenCalled();
 });
});
