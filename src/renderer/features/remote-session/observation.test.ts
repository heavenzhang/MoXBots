import { expect, it } from 'vitest';
import type { NetworkSnapshot } from '@/api/agentNetwork';
import type { RemoteSnapshot } from '../../../shared/remoteSession';
import type { RemoteSessionObservation, RemoteSessionTab } from './tabContract';
import { applyRemoteObservation, currentRemoteObservation, remoteActivityKey } from './observation';
const current: NetworkSnapshot = { state: 'ready', principalId: 'p', networkId: 'n', authGeneration: 4, revision: 1, error: null };
const tab: RemoteSessionTab = { id: 'tab', view: 'remote-session', title: 'Agent', agentId: 'a', agentName: 'Agent', deviceName: 'Device', sessionId: 's', targetScope: null,
  locator: { connectionId: 'owned:test', principalId: 'p', networkId: 'n', deviceId: 'd', authGeneration: 4 } };
const observation: RemoteSessionObservation = { title: 'New title', state: 'running', sync: 'current', lastSyncedAt: 100, hasUnread: true };
it('only the current verified account generation can publish title and unread state', () => {
  const next = applyRemoteObservation(tab, current, 4, observation);
  expect(next.title).toBe('New title');
  expect(currentRemoteObservation(next, current)).toMatchObject({ hasUnread: true });
  for (const account of [null, { ...current, state: 'signedOut' as const }, { ...current, principalId: null }, { ...current, networkId: 'other' }, { ...current, principalId: 'other' }]) {
    expect(applyRemoteObservation(tab, account, 4, observation)).toBe(tab);
    expect(currentRemoteObservation(next, account)).toBeUndefined();
  }
  expect(applyRemoteObservation(tab, { ...current, authGeneration: 5 }, 4, observation)).toBe(tab);
  expect(currentRemoteObservation(next, { ...current, authGeneration: 5 })).toBeUndefined();
});
it('snapshot metadata changes do not masquerade as new content, while edits and interactions do', () => {
  const snapshot: RemoteSnapshot = { kind: 'snapshot', agentId: 'a', sessionId: 's', generation: 'g', turnId: 't', revision: 'hash', state: 'running', terminal: null, title: 'title', runtime: 'builtin', model: null,
    messages: [{ id: 'm', role: 'assistant', content: 'First', timestamp: '', truncated: false, tools: [] }], interactions: [], hasMoreBefore: false, nextBefore: null };
  expect(remoteActivityKey({ ...snapshot, revision: 'different', title: 'renamed', model: 'other' })).toBe(remoteActivityKey(snapshot));
  expect(remoteActivityKey({ ...snapshot, messages: [{ ...snapshot.messages[0], content: 'First and more' }] })).not.toBe(remoteActivityKey(snapshot));
  expect(remoteActivityKey({ ...snapshot, state: 'waiting_user_action' })).toBe(remoteActivityKey(snapshot));
});
