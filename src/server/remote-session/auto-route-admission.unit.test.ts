import { describe, expect, it } from 'vitest';
import type { SessionMetadata } from '../types/session';
import { createRemoteAutoRouteSnapshotAdmission } from './auto-route-admission';

function fixture() {
  const before = { id: 's', agentDir: '/workspace', model: 'one', providerId: 'p',
    providerRoute: { kind: 'provider', providerId: 'p', model: 'one' },
    runtime: 'builtin', permissionMode: 'plan', configSnapshotAt: 'before' } as SessionMetadata;
  // Include all desired fields in this isolated observer. Production uses the
  // existing owner's imSnapshotObservation, never a second ownership policy.
  const observe = (snapshot: SessionMetadata) => JSON.stringify(Object.fromEntries(Object.entries(snapshot)
    .filter(([key]) => key !== 'lastActiveAt').sort(([a], [b]) => a.localeCompare(b))));
  const after = { ...before, model: 'two', providerId: 'q', reasoningEffort: 'high',
    providerRoute: { kind: 'provider' as const, providerId: 'q', model: 'two' }, configSnapshotAt: 'after' };
  let current: SessionMetadata = after;
  let ownerCurrent = true;
  const admission = createRemoteAutoRouteSnapshotAdmission({ initial: before,
    observation: observe(before), observe, current: () => current, isOwnerCurrent: () => ownerCurrent });
  return { before, after, admission, setCurrent: (value: SessionMetadata) => { current = value; },
    changeOwner: () => { ownerCurrent = false; } };
}

describe('remote automatic route snapshot acknowledgement', () => {
  it('accepts one own CAS and preserves the exact new guard after activity updates', () => {
    const f = fixture();
    expect(f.admission.isCurrent(f.before)).toBe(true);
    expect(f.admission.isCurrent(f.after)).toBe(false);
    f.admission.didApply(f.before, f.after);
    expect(f.admission.isCurrent({ ...f.after, lastActiveAt: 'later' })).toBe(true);
    expect(f.admission.isCurrent(f.before)).toBe(false);
    expect(() => f.admission.didApply(f.after, f.after)).toThrow('REMOTE_SESSION_OWNER_CHANGED');
  });

  it.each([
    { permissionMode: 'full' }, { mcpEnabledServers: ['extra'] }, { enabledPluginIds: ['extra'] },
    { runtime: 'codex' }, { modelMode: 'manual' }, { id: 'other' }, { agentDir: '/other' },
    { sdkSessionId: 'other' }, { hostBotBinding: { botId: 'b', runGeneration: 'r' } },
    { materializationState: 'published' },
  ] as Partial<SessionMetadata>[])('rejects a non-route change mixed into the own CAS: %j', change => {
    const f = fixture(), changed = { ...f.after, ...change };
    f.setCurrent(changed);
    expect(() => f.admission.didApply(f.before, changed)).toThrow('REMOTE_SESSION_OWNER_CHANGED');
    expect(f.admission.isCurrent(changed)).toBe(false);
  });

  it('rejects a later edit even if CAS succeeded and timestamp did not advance', () => {
    const f = fixture();
    f.setCurrent({ ...f.after, model: 'external' });
    expect(() => f.admission.didApply(f.before, f.after)).toThrow('REMOTE_SESSION_OWNER_CHANGED');
  });

  it('rejects owner replacement before or after its own CAS', () => {
    const first = fixture(); first.changeOwner();
    expect(first.admission.isCurrent(first.before)).toBe(false);
    expect(() => first.admission.didApply(first.before, first.after)).toThrow('REMOTE_SESSION_OWNER_CHANGED');
    const second = fixture(); second.admission.didApply(second.before, second.after); second.changeOwner();
    expect(second.admission.isCurrent(second.after)).toBe(false);
  });
});
