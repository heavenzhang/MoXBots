import { createHash } from 'node:crypto';
import { unwrapSdkResult } from '../../shared/sdkResultText';
import { getSessionData, getSessionMetadata, isHistoryVisibleSession } from '../SessionStore';
import { getSessionEngine } from '../session-engine';
import { projectSessionActivity } from '../session-engine/observation';
import type { SessionEnginePendingInteractiveRequest } from '../session-engine/types';
import { mergeSessionMessagesByIdentity, projectSessionTextMessage } from '../session-text-projection';
import { REMOTE_SESSION_BYTES, remoteSessionResultSchema, type RemoteMessage, type RemoteSnapshot, type RemoteInteraction } from '../../shared/remoteSession';
import { RemoteSessionError } from './receipts';
import type { SessionMessage } from '../types/session';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function display(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, (key,item:unknown) => /^(apiKey|apiKeys|accessToken|refreshToken|authorization|credential|password|secret)$/i.test(key) ? '[redacted]' : item) ?? ''; } catch { return ''; }
}
function clipped(value: unknown, max: number): string { return display(value).slice(0,max); }
export function projectRemoteInteractions(items: SessionEnginePendingInteractiveRequest[], generation: string | null, turnId: string | null): RemoteInteraction[] {
  if (!generation || !turnId) return [];
  return items.slice(0,8).flatMap(item=>{
    const data=record(item.data),requestId=data.requestId;
    if(typeof requestId!=='string')return [];
    const question=item.type==='ask-user-question:request',plan=item.type==='exit-plan-mode:request';
    if(!question&&!plan&&item.type!=='permission:request')return [];
    const questions=Array.isArray(data.questions)?data.questions:[];
    const raw=question?'请回答以下问题。':plan?display(data.plan||'确认这份计划后继续。'):display(data.input);
    // The builtin legacy input projection is capped at 500. A boundary hit is
    // not a complete operation review; approval must stay on the target UI.
    const completePermission=raw.trim().length>0&&raw.length<500&&data.review===undefined&&data.reviewRef===undefined;
    const actionable=raw.length<=4000 && (plan||question||completePermission) && questions.length<=6 && questions.every(q=>{
      const obj=record(q);return obj.isSecret!==true&&typeof obj.question==='string'&&obj.question.length<=512&&Array.isArray(obj.options)&&obj.options.length<=8&&obj.options.every(v=>clipped(record(v).label,256)===record(v).label);
    });
    return [{requestId,generation,turnId,interaction:question?'question' as const:plan?'plan' as const:'permission' as const,
      title:question?'需要补充信息':plan?'确认执行计划':clipped(data.toolName||'工具执行请求',256),description:raw.slice(0,4000),actionable,
      questions:questions.slice(0,6).map(q=>{const obj=record(q);return {answerKey:clipped(obj.id||obj.question,512),question:clipped(obj.question,512),options:(Array.isArray(obj.options)?obj.options:[]).slice(0,8).map(v=>clipped(record(v).label,256)),multiSelect:obj.multiSelect===true}})}];
  });
}
const MESSAGE_BYTES = 24 * 1024;

/** Split display text, not serialized envelopes. The same source position gets
 * the same ID on every read; before-pagination can reach every continuation.
 * Both UTF-16 schema bounds and escaped UTF-8 transport bytes must fit. */
function textParts(text: string, maxCharacters: number): string[] {
  if (!text) return [''];
  const parts: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let low = 1, high = Math.min(maxCharacters, text.length - offset);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (Buffer.byteLength(JSON.stringify(text.slice(offset, offset + middle))) <= MESSAGE_BYTES - 1024) low = middle;
      else high = middle - 1;
    }
    let end = offset + low;
    if (maxCharacters === 16000 && end < text.length) {
      const paragraph = text.lastIndexOf('\n\n', end - 2);
      if (paragraph > offset + low / 2) end = paragraph + 2;
    }
    // Never break an emoji into two invalid surrogate halves.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    parts.push(text.slice(offset, end));
    offset = end;
  }
  return parts;
}

/** Pure read projection over the original Session transcript. Existing wire
 * limits bound each fragment, not the amount of history a user may read. */
export function projectRemoteMessages(message: SessionMessage): RemoteMessage[] {
  const projected = projectSessionTextMessage(message); // validates structured text / hides reminders
  if (message.role !== 'user' && message.role !== 'assistant') return [];
  const role = message.role;
  const fragments: RemoteMessage[] = [];
  let current: RemoteMessage | undefined;
  const fragmentId = (key: string) => `remote-content-${createHash('sha256').update(JSON.stringify([message.id, key])).digest('hex')}`;
  const begin = (key: string, content = '') => {
    if (current) fragments.push(current);
    current = { id: !fragments.length ? message.id : fragmentId(key), role,
      timestamp: message.timestamp, content, truncated: false, tools: [] };
  };
  const appendText = (text: string, key: string) => {
    textParts(text, 16000).forEach((part, index) => begin(`${key}:${index}`, part));
  };
  if (role === 'assistant' && message.content.trim().startsWith('[') && message.content.includes('"type"')) {
    const blocks: unknown[] = JSON.parse(message.content);
    blocks.forEach((value, blockIndex) => {
      const block = record(value), tool = record(block.tool);
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        appendText(block.text, `text:${blockIndex}`);
      } else if (block.type === 'tool_use' && (typeof block.id === 'string' || typeof tool.id === 'string')) {
        const toolId = typeof block.id === 'string' ? block.id : tool.id as string;
        // Decode once before splitting. Raw inputs, hidden thinking and local
        // attachment/permission metadata never enter the observation contract.
        const result = unwrapSdkResult(display(tool.result ?? block.result ?? ''));
        const parts = textParts(result, 2000);
        parts.forEach((summary, index) => {
          const key = `tool:${blockIndex}:${index}`;
          const suffix = index ? ` · ${index + 1}` : '';
          const part: RemoteMessage['tools'][number] = {
            id: index === 0 ? toolId : fragmentId(key),
            name: clipped(block.name || tool.name || '工具调用', 160 - suffix.length) + suffix,
            status: tool.isError === true || tool.status === 'error' ? 'error'
              : tool.status === 'running' ? 'running' : 'complete',
            summary,
          };
          // Continuations are individual rows, not additional completed calls
          // in a phase count. Keep subsequent real calls out of that last row.
          if (parts.length > 1 || !current || current.tools.length === 10
            || Buffer.byteLength(JSON.stringify({ ...current, tools: [...current.tools, part] })) > MESSAGE_BYTES) begin(key);
          current!.tools.push(part);
        });
        if (parts.length > 1) { fragments.push(current!); current = undefined; }
      }
    });
  } else if (projected) appendText(projected.content, 'text');
  if (current) fragments.push(current);
  return fragments;
}

/** One whole snapshot is projected from the original Session owner. UI applies
 * it as a replacement, so gaps cannot lose deltas or resurrect old approvals. */
export async function buildRemoteSnapshot(agentId: string, sessionId: string, generation: string | null, limit: number, before?: string):Promise<RemoteSnapshot>{
  const metadata=getSessionMetadata(sessionId);
  if(!metadata||!isHistoryVisibleSession(metadata))throw new RemoteSessionError('REMOTE_SESSION_NOT_FOUND');
  const stored=await getSessionData(sessionId);
  if(!stored||stored.transcriptRecovery==='unavailable')throw new RemoteSessionError('REMOTE_HISTORY_UNAVAILABLE');
  const engine=getSessionEngine(),overlay=engine.getLiveSessionOverlay(sessionId);
  const live=overlay.isActive&&engine.getCurrentSessionContext().sessionId===sessionId;
  const messages=mergeSessionMessagesByIdentity(live&&stored.transcriptFormat===2?[]:stored.messages,live?overlay.inMemoryMessages:undefined,live?overlay.liveStreamingMessage:undefined).flatMap(projectRemoteMessages);
  let end=messages.length;
  if(before){end=messages.findIndex(m=>m.id===before);if(end<0)throw new RemoteSessionError('REMOTE_HISTORY_ANCHOR_CHANGED')}
  let start=Math.max(0,end-limit);
  const turnId=live?engine.getExecutionTurnId()||null:null;
  const terminal=live?engine.getSessionCompletionTerminal():null;
  const lastTurn=stored.transcriptTurns?.at(-1);
  const state=live?projectSessionActivity(engine.getLiveSessionState()):'idle';
  const result:RemoteSnapshot={kind:'snapshot',agentId,sessionId,generation:live?generation:null,turnId,
    revision:'',state,title:(metadata.title||'会话').slice(0,256),runtime:metadata.runtime||engine.getRuntimeIdentity().runtime,
    model:metadata.model?.slice(0,256)||null,terminal:terminal?.status||(!live&&lastTurn&&lastTurn.status!=='running'?lastTurn.status:null),
    messages:messages.slice(start,end),interactions:live?projectRemoteInteractions(overlay.pendingInteractiveRequests||engine.getStreamReplaySnapshot().pendingInteractiveRequests,generation,turnId):[],
    hasMoreBefore:start>0,nextBefore:start>0?messages[start].id:null};
  while(Buffer.byteLength(JSON.stringify(result))>REMOTE_SESSION_BYTES-1024&&result.messages.length>1){result.messages.shift();start++;result.hasMoreBefore=true;result.nextBefore=result.messages[0].id}
  if(Buffer.byteLength(JSON.stringify(result))>REMOTE_SESSION_BYTES-1024)throw new RemoteSessionError('REMOTE_PROJECTION_TOO_LARGE');
  result.revision=createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return remoteSessionResultSchema.parse(result) as RemoteSnapshot;
}
