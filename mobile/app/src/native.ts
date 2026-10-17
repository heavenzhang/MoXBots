import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { z } from 'zod';

const id = z.string().min(1).max(256).regex(/^[A-Za-z0-9._:-]+$/);
const sessionId = z.string().min(1).max(99).regex(/^[A-Za-z0-9-]+$/);
const message = z.object({ id, role: z.enum(['user', 'assistant']), timestamp: z.string().max(64), content: z.string().max(16000), truncated: z.boolean(), tools: z.array(z.object({ id, name: z.string().max(160), status: z.enum(['running', 'complete', 'error']), summary: z.string().max(2000) }).strict()).max(10) }).strict();
const interaction = z.object({ requestId: id, generation: id, turnId: id, interaction: z.enum(['permission', 'plan', 'question']), title: z.string().max(256), description: z.string().max(4000), actionable: z.boolean(), questions: z.array(z.object({ answerKey: z.string().max(512), question: z.string().max(512), options: z.array(z.string().max(256)).max(8), multiSelect: z.boolean() }).strict()).max(6) }).strict();
const sessionResult = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('capabilities'), version: z.literal(1), agentId: id, runtime: z.string().max(64), maxActiveSessions: z.number().int().min(1).max(100), liveUpdates: z.literal('snapshot') }).strict(),
  z.object({ kind: z.literal('list'), agentId: id, items: z.array(z.object({ sessionId, title: z.string().max(256), updatedAt: z.string().max(64), preview: z.string().max(512), runtime: z.string().max(64) }).strict()).max(30), hasMore: z.boolean(), nextBefore: z.string().max(256).nullable() }).strict(),
  z.object({ kind: z.literal('snapshot'), agentId: id, sessionId, generation: id.nullable(), turnId: id.nullable(), revision: z.string().max(128), state: z.enum(['idle', 'running', 'waiting_user_action', 'unavailable']), title: z.string().max(256), runtime: z.string().max(64), model: z.string().max(256).nullable(), terminal: z.enum(['complete', 'stopped', 'error', 'interrupted']).nullable(), messages: z.array(message).max(30), interactions: z.array(interaction).max(8), hasMoreBefore: z.boolean(), nextBefore: z.string().max(256).nullable() }).strict(),
  z.object({ kind: z.literal('receipt'), agentId: id, operationId: z.string().uuid(), sessionId: sessionId.nullable(), status: z.enum(['processing', 'accepted', 'rejected', 'unconfirmed', 'not-found']), code: z.string().regex(/^[A-Z0-9_]+$/).max(128).nullable() }).strict(),
  z.object({ kind: z.literal('error'), code: z.string().regex(/^[A-Z0-9_]+$/).max(128) }).strict(),
]);
const speechReply = z.object({ kind: z.literal('speech'), state: z.enum(['recording', 'transcribing', 'idle']), text: z.string().max(8000), final: z.boolean(), code: z.string().regex(/^[A-Z0-9_]+$/).max(128).optional() }).strict();

export type Account = { kind: 'account'; state: 'signed-out' | 'authenticating' | 'signed-in' | 'expired'; displayName: string | null; principalId: string | null };
export type Target = { targetId: string; agentId: string; name: string; deviceName: string; online: boolean; runtime: string | null };
export type SessionRequest =
  | { kind: 'capabilities'; agentId: string }
  | { kind: 'list'; agentId: string; limit: number; before?: string }
  | { kind: 'get'; agentId: string; sessionId: string; limit: number; before?: string }
  | { kind: 'start'; agentId: string; operationId: string; text: string }
  | { kind: 'send'; agentId: string; sessionId: string; operationId: string; text: string }
  | { kind: 'receipt'; agentId: string; operationId: string }
  | { kind: 'respond'; agentId: string; sessionId: string; operationId: string; generation: string; turnId: string; requestId: string; interaction: 'permission' | 'plan' | 'question'; approved: boolean; answers?: Record<string, string> }
  | { kind: 'stop'; agentId: string; sessionId: string; operationId: string; generation: string; turnId: string };
export type SessionResult = z.infer<typeof sessionResult>;
export type SpeechReply = z.infer<typeof speechReply>;
export type Snapshot = Extract<SessionResult, { kind: 'snapshot' }>;
export type Interaction = Snapshot['interactions'][number];
export type PendingOperation = { targetId: string; agentId: string; operationId: string; sessionId: string | null; status: 'prepared' | 'unknown' | 'processing' };

export type NativeIntent =
  | { version: 1; kind: 'account.status' | 'account.login.poll' | 'account.logout' }
  | { version: 1; kind: 'account.login.start' }
  | { version: 1; kind: 'targets.list' }
  | { version: 1; kind: 'operations.pending' }
  | { version: 1; kind: 'speech.start' | 'speech.stop' | 'speech.cancel' }
  | { version: 1; kind: 'session'; targetId: string; request: SessionRequest };

const accountSchema = z.object({ kind: z.literal('account'), state: z.enum(['signed-out', 'authenticating', 'signed-in', 'expired']), displayName: z.string().nullable(), principalId: z.string().nullable() }).strict();
const targetSchema = z.object({ targetId: z.string().min(1), agentId: id, name: z.string(), deviceName: z.string(), online: z.boolean(), runtime: z.string().nullable() }).strict();
const pendingSchema = z.object({ kind: z.literal('operations'), items: z.array(z.object({ targetId: z.string(), agentId: id, operationId: z.string().uuid(), sessionId: sessionId.nullable(), status: z.enum(['prepared', 'unknown', 'processing']) }).strict()) }).strict();
const nativeReply = z.union([accountSchema, z.object({ kind: z.literal('login'), authorizationUrl: z.string().url(), expiresAt: z.number() }).strict(), z.object({ kind: z.literal('targets'), items: z.array(targetSchema).max(100), hasMore: z.boolean() }).strict(), pendingSchema, sessionResult, speechReply, z.object({ kind: z.literal('error'), code: z.string().regex(/^[A-Z0-9_]+$/).max(128) }).strict()]);

type RemoteBridge = { request(intentJSON: string): Promise<string>; addListener(event: 'speechChanged', listener: (payload: SpeechReply) => void): { remove(): void } };
function getRemoteBridge(): RemoteBridge {
  return requireNativeModule<RemoteBridge>('MoxBotsRemote');
}

function moduleRequest(intent: NativeIntent): Promise<unknown> {
  try {
    const bridge = getRemoteBridge();
    return bridge.request(JSON.stringify(intent)).then((raw) => JSON.parse(raw));
  } catch (error) {
    return Promise.reject(error);
  }
}

export function subscribeSpeechChanges(listener: (payload: SpeechReply) => void): () => void {
  if (isFixtureMode) return () => undefined;
  const subscription = getRemoteBridge().addListener('speechChanged', listener);
  return () => subscription.remove();
}

export async function requestNative(intent: NativeIntent): Promise<z.infer<typeof nativeReply>> {
  if (isFixtureMode) {
    const { fixtureReply } = await import('../qa/fixture');
    const parsedFixture = nativeReply.safeParse(fixtureReply(intent));
    if (!parsedFixture.success) throw new Error('QA_FIXTURE_REPLY_INVALID');
    return parsedFixture.data;
  }
  const parsed = nativeReply.safeParse(await moduleRequest(intent));
  if (!parsed.success) throw new Error('NATIVE_REPLY_INVALID');
  return parsed.data;
}

export const isFixtureMode = __DEV__ && Platform.OS === 'web' && process.env.EXPO_PUBLIC_MOBILE_QA === '1';

export type QaScenario = 'conversation' | 'multi-bot' | 'offline' | 'approval' | 'stale-approval' | 'unknown-receipt' | 'reset-unknown' | 'network-error';
export const qaScenarioOptions: readonly { id: QaScenario; label: string }[] = [
  { id: 'conversation', label: '会话' }, { id: 'multi-bot', label: '多 Bot / 离线' },
  { id: 'offline', label: '全部离线' }, { id: 'approval', label: '审批 / 拒绝' },
  { id: 'stale-approval', label: '过期审批' }, { id: 'unknown-receipt', label: '回执未知' },
  { id: 'reset-unknown', label: '重启后未确认' },
  { id: 'network-error', label: '网络错误' },
];

export async function selectQaScenario(scenario: QaScenario): Promise<void> {
  if (!isFixtureMode) return;
  const fixture = await import('../qa/fixture');
  fixture.selectScenario(scenario);
}

export async function armQaStaleApproval(): Promise<void> {
  if (!isFixtureMode) return;
  const fixture = await import('../qa/fixture');
  fixture.armStaleApproval();
}

export function parseSessionReply(reply: z.infer<typeof nativeReply>): SessionResult {
  const parsed = sessionResult.safeParse(reply);
  if (!parsed.success) throw new Error('SESSION_REPLY_INVALID');
  return parsed.data;
}
