import type { RuntimeSource, RuntimeType } from '../../shared/types/runtime';
import type { SessionMetadata } from '../types/session';
import { handleAgentShow } from '../admin-api';
import { handleImModelRoute, type ImModelOption } from '../routes/im-model-selection';

/** Read-only model choices constrained to the same frozen runtime/provider
 * authority used by the original Desktop mobile owner. */
export async function resolveRemoteMobileModelChoices(agentId:string,metadata?:SessionMetadata) {
  const shown=await handleAgentShow({agentId});if(!shown.success)throw new Error('REMOTE_AGENT_UNAVAILABLE');
  const defaults=(shown.data as {effectiveDefaults:{runtime:RuntimeType;runtimeSource?:RuntimeSource;providerId?:string}}).effectiveDefaults;
  const runtime=metadata?.runtime??defaults.runtime;
  const source=metadata?.runtimeSource??defaults.runtimeSource;
  const provider=metadata?.providerId??(metadata?undefined:defaults.providerId);
  const url=new URL('http://internal/api/im/model-options');url.searchParams.set('agentId',agentId);if(metadata)url.searchParams.set('sessionId',metadata.id);
  const response=await handleImModelRoute('/api/im/model-options',new Request(url));
  const body=await response?.json() as {success?:boolean;options?:ImModelOption[]}|undefined;
  if(!response?.ok||!body?.success||!Array.isArray(body.options))throw new Error('REMOTE_MOBILE_MODELS_UNAVAILABLE');
  const native=(runtime==='codex'||runtime==='claude-code')&&source!=='managed-provider';
  const items=body.options.filter(option=>!option.requiresNewSession&&(native
    ? option.selection.kind==='external-cli'&&option.selection.runtime===runtime&&option.selection.runtimeSource===(source??'system-cli')
    : option.selection.kind==='product-provider'&&!!provider&&option.selection.providerId===provider))
    .map(option=>({id:option.selection.model,label:option.name}))
    .filter(item=>item.id.length>0&&item.id.length<=256&&item.label.length>0&&item.label.length<=256&&!/[\p{Cc}]/u.test(item.id+item.label));
  if(new Set(items.map(item=>item.id)).size!==items.length||items.length>30)throw new Error('REMOTE_MOBILE_MODELS_UNAVAILABLE');
  return items;
}
