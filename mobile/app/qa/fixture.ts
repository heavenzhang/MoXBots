import type { Account, PendingOperation, SessionRequest, Snapshot, Target } from '../src/native';

export type QaScenario = 'conversation' | 'multi-bot' | 'offline' | 'approval' | 'stale-approval' | 'unknown-receipt' | 'reset-unknown' | 'network-error';

const target: Target = { targetId: 'qa-target-internal-only', agentId: 'qa-agent', name: '演示 Bot', deviceName: '本地演示设备', online: true, runtime: null };
const offlineTarget: Target = { targetId: 'qa-offline-target', agentId: 'qa-offline-agent', name: '离线 Bot', deviceName: '离线演示设备', online: false, runtime: null };
const account: Account = { kind: 'account', state: 'signed-in', displayName: '演示账号', principalId: 'qa-principal' };
let scenario: QaScenario = 'conversation';
let active: Snapshot | null = null;
let staleApprovalNextRead = false;
let sessions: { sessionId: string; title: string; updatedAt: string; preview: string; runtime: string }[] = [{ sessionId: 'qa-session-1', title: '产品方案讨论', updatedAt: new Date().toISOString(), preview: '梳理移动端的会话体验', runtime: 'codex' }];

export function selectScenario(next: QaScenario): void {
  scenario = next;
  active = null;
  staleApprovalNextRead = false;
}

export function armStaleApproval(): void {
  staleApprovalNextRead = true;
}

export function fixtureReply(intent: { kind: string; request?: SessionRequest; targetId?: string }): unknown {
  if (intent.kind === 'account.status' || intent.kind === 'account.login.poll' || intent.kind === 'account.logout') return intent.kind === 'account.logout' ? { kind: 'account', state: 'signed-out', displayName: null, principalId: null } : account;
  if (intent.kind === 'account.login.start') return { kind: 'login', authorizationUrl: 'https://example.invalid/qa-only', expiresAt: 0 };
  if (intent.kind === 'targets.list') {
    if (scenario === 'network-error') return { kind: 'error', code: 'MOBILE_REMOTE_UNAVAILABLE' };
    return { kind: 'targets', items: scenario === 'multi-bot' ? [target, offlineTarget] : scenario === 'offline' ? [offlineTarget] : [target], hasMore: false };
  }
  if (intent.kind === 'operations.pending') return { kind: 'operations', items: scenario === 'reset-unknown' ? [{ targetId: target.targetId, agentId: target.agentId, operationId: '00000000-0000-4000-8000-000000000042', sessionId: 'qa-session-1', status: 'unknown' }] : [] as PendingOperation[] };
  if (intent.kind === 'session' && intent.request) return sessionReply(intent.request);
  return { kind: 'error', code: 'QA_FIXTURE_OPERATION_UNSUPPORTED' };
}

function makeSnapshot(sessionId: string, agentId: string, state: Snapshot['state'] = 'idle', generation = 'qa-generation-1', turnId: string | null = null, includeApproval = false): Snapshot {
  const title = sessions.find((item) => item.sessionId === sessionId)?.title ?? '演示会话';
  return {
    kind: 'snapshot', agentId, sessionId, generation, turnId, revision: String(Date.now()), state, title,
    runtime: 'codex', model: '本地演示', terminal: state === 'idle' ? null : null,
    messages: [
      { id: 'qa-message-1', role: 'assistant', timestamp: new Date(Date.now() - 8 * 60_000).toISOString(), content: '你好，我可以帮你整理产品方案。你想先讨论哪一部分？', truncated: false, tools: [] },
      { id: 'qa-message-2', role: 'user', timestamp: new Date(Date.now() - 6 * 60_000).toISOString(), content: '梳理移动端的会话体验，优先解决主界面布局。', truncated: false, tools: [] },
      { id: 'qa-message-3', role: 'assistant', timestamp: new Date(Date.now() - 5 * 60_000).toISOString(), content: '建议把会话内容作为主视图：顶部保留标题、Bot 和成果入口；输入区保持单行，需要附件或语音时再展开辅助操作。', truncated: false, tools: [] },
    ],
    interactions: includeApproval ? [{
      requestId: 'qa-approval-1', generation, turnId: turnId ?? 'qa-turn-1', interaction: 'permission',
      title: '允许读取项目文件？', description: '演示审批卡用于验证审批布局与提交前刷新。', actionable: true, questions: [],
    }] : [],
    hasMoreBefore: false, nextBefore: null,
  };
}

function sessionReply(request: SessionRequest): unknown {
  if (request.kind === 'capabilities') return { kind: 'capabilities', version: 1, agentId: request.agentId, runtime: 'codex', maxActiveSessions: 5, liveUpdates: 'snapshot' };
  if (request.kind === 'list') return { kind: 'list', agentId: request.agentId, items: sessions, hasMore: false, nextBefore: null };
  if (request.kind === 'get') {
    if (staleApprovalNextRead && scenario === 'stale-approval') {
      staleApprovalNextRead = false;
      active = makeSnapshot(request.sessionId, request.agentId, 'waiting_user_action', 'qa-generation-2', 'qa-turn-2', true);
      active.interactions[0].requestId = 'qa-approval-2';
      return active;
    }
    if (!active || active.sessionId !== request.sessionId) {
      const approval = scenario === 'approval' || scenario === 'stale-approval';
      active = makeSnapshot(request.sessionId, request.agentId, approval ? 'waiting_user_action' : 'idle', 'qa-generation-1', approval ? 'qa-turn-1' : null, approval);
    }
    return active;
  }
  if (request.kind === 'respond') {
    active = active ? { ...active, revision: String(Date.now()), state: 'idle', turnId: null, interactions: [], terminal: 'complete' } : null;
    return { kind: 'receipt', agentId: request.agentId, operationId: request.operationId, sessionId: request.sessionId, status: 'accepted', code: null };
  }
  if (request.kind === 'start' || request.kind === 'send') {
    if (scenario === 'unknown-receipt') return { kind: 'receipt', agentId: request.agentId, operationId: request.operationId, sessionId: request.kind === 'send' ? request.sessionId : null, status: 'unconfirmed', code: 'MOBILE_RECEIPT_REQUIRED' };
    const sessionId = request.kind === 'start' ? `qa-session-${sessions.length + 1}` : request.sessionId;
    const prior = request.kind === 'send' ? active?.messages ?? [] : [];
    const text = request.text;
    const title = text.slice(0, 48);
    const now = new Date().toISOString();
    const additions: Snapshot['messages'] = [
      { id: `qa-user-${Date.now()}`, role: 'user', timestamp: now, content: text, truncated: false, tools: [] },
      { id: `qa-reply-${Date.now()}`, role: 'assistant', timestamp: now, content: '可以先从信息架构、消息阅读和输入操作三部分梳理，再逐步补充附件与语音能力。', truncated: false, tools: [] },
    ];
    active = { ...makeSnapshot(sessionId, request.agentId), revision: String(Date.now()), title, terminal: 'complete', messages: [...prior, ...additions].slice(-30) };
    if (request.kind === 'start') sessions = [{ sessionId, title, updatedAt: now, preview: text, runtime: 'codex' }, ...sessions].slice(0, 30);
    return { kind: 'receipt', agentId: request.agentId, operationId: request.operationId, sessionId, status: 'accepted', code: null };
  }
  if (request.kind === 'receipt') return { kind: 'receipt', agentId: request.agentId, operationId: request.operationId, sessionId: active?.sessionId ?? null, status: 'not-found', code: null };
  return { kind: 'error', code: 'QA_FIXTURE_OPERATION_UNSUPPORTED' };
}
