import { expect, it, vi } from 'vitest';
import { remoteAdmissionRejectionCode, rejectRemoteAdmission } from './admission';

it.each([
  ['Provider/model selection is incomplete. Select a provider-model pair before sending.', 'REMOTE_PROVIDER_SELECTION_REQUIRED'],
  ['ProviderRoute/model mismatch: route model "a" does not match request model "b".', 'REMOTE_PROVIDER_MODEL_MISMATCH'],
  ['Provider "private-provider" is unavailable or missing an API key. secret-suffix', 'REMOTE_PROVIDER_UNAVAILABLE'],
  ["Subscription provider 'private-provider' cannot execute in builtin runtime", 'REMOTE_PROVIDER_UNAVAILABLE'],
  ['Invalid builtin permission mode: invalid', 'REMOTE_RUNTIME_PERMISSION_INVALID'],
  ["Invalid permissionMode 'fullAgency' for codex", 'REMOTE_RUNTIME_PERMISSION_INVALID'],
  ['Workspace capabilities are unavailable: /private/workspace', 'REMOTE_WORKSPACE_CAPABILITIES_UNAVAILABLE'],
  ['Queue full (max 10)', 'REMOTE_SESSION_QUEUE_FULL'],
  ['Queue item was cancelled before dispatch', 'REMOTE_SESSION_ADMISSION_CANCELLED'],
  ['Session materialization was rolled back before turn admission.', 'REMOTE_SESSION_ADMISSION_CANCELLED'],
  ['REMOTE_SESSION_OWNER_CHANGED', 'REMOTE_SESSION_OWNER_CHANGED'],
  ['REMOTE_PREPARED_ADMISSION_FAILED', 'REMOTE_PREPARED_ADMISSION_FAILED'],
])('projects known refusal to a safe code: %s', (reason, code) => {
  expect(remoteAdmissionRejectionCode(reason, 'enqueue')).toBe(code);
  expect(remoteAdmissionRejectionCode(reason, 'dispatch')).toBe(code);
});

it('keeps unknown errors private and distinguishes enqueue from dispatch without granting a retry', () => {
  for (const error of [undefined, 'secret-token /private/workspace', 'REMOTE_NEW_UNREVIEWED_SECRET', new Error('secret-token')]) {
    expect(remoteAdmissionRejectionCode(error, 'enqueue')).toBe('REMOTE_SESSION_ADMISSION_REJECTED');
    expect(remoteAdmissionRejectionCode(error, 'dispatch')).toBe('REMOTE_SESSION_DISPATCH_REJECTED');
  }
});

it('logs only correlation IDs, phase and a safe category, never the adapter message', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(() => rejectRemoteAdmission('secret-token /private/workspace', 'dispatch',
      { kind: 'start', operationId: 'operation', agentId: 'agent' }, 'session')).toThrow('REMOTE_SESSION_DISPATCH_REJECTED');
    expect(warn).toHaveBeenCalledWith('[remote-session] admission rejected', {
      phase: 'dispatch', code: 'REMOTE_SESSION_DISPATCH_REJECTED', kind: 'start', operationId: 'operation', agentId: 'agent', sessionId: 'session',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('/private/workspace');
  } finally { warn.mockRestore(); }
});
