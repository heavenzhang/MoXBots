import type { RemoteMobileRequest } from '../shared/remoteMobile';

type StartRequest = Extract<RemoteMobileRequest, {kind:'mobile.start'}>;
type Receipt = {status:string;sessionId?:string|null;[key:string]:unknown};

/** Headless new-chat admission is owned by the Host receipt journal and the
 * existing Host Session lifecycle. A repeated or uncertain operation never
 * creates another worker or sends another turn. */
export async function admitHeadlessMobileStart<TTarget>(input:{
  request:StartRequest;
  manifestHash:string;
  begin:(request:StartRequest)=>Promise<{fresh:boolean}>;
  read:(request:StartRequest,manifestHash:string)=>Promise<Receipt>;
  ensure:(agentId:string)=>Promise<{target:TTarget;sessionId:string}>;
  adopt:(request:StartRequest,sessionId:string,manifestHash:string)=>Promise<boolean>;
  dispatch:(target:TTarget,sessionId:string,request:StartRequest)=>Promise<{accepted:boolean}>;
  finish:(request:StartRequest,status:'accepted'|'rejected',sessionId:string,code:string|null)=>Promise<Receipt>;
}):Promise<Receipt>{
  const {request,manifestHash}=input;
  const begun=await input.begin(request);
  if(!begun.fresh)return input.read(request,manifestHash);
  let sessionId:string|undefined;
  try{
    const ensured=await input.ensure(request.agentId);
    sessionId=ensured.sessionId;
    if(!await input.adopt(request,sessionId,manifestHash))return input.read(request,manifestHash);
    const result=await input.dispatch(ensured.target,sessionId,request);
    return await input.finish(request,result.accepted?'accepted':'rejected',sessionId,result.accepted?null:'REMOTE_MOBILE_ADMISSION_REJECTED');
  }catch{
    // ensure/adopt/IPC loss may follow a Host-side effect. Keep the original
    // receipt authoritative and force explicit reconciliation, never replay.
    return input.read(request,manifestHash);
  }
}
