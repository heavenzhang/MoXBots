import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasQueryBackgroundTasks,
  hasQueryBackgroundWork,
  isQueryAwaitingExit,
  recordQueryBackgroundTask,
  replaceQueryBackgroundActivity,
  resetLifecycleForTest,
  setQuerySession,
  waitForQueryExit,
} from './lifecycle';

describe('exact Query rebuild activity', () => {
  beforeEach(resetLifecycleForTest);
  afterEach(resetLifecycleForTest);

  it('keeps an ambient display record without blocking a rebuild', () => {
    const query = {} as Query;
    setQuerySession(query);
    recordQueryBackgroundTask(query, 'watcher', { ambient: true });
    replaceQueryBackgroundActivity(query, [
      { task_id: 'watcher', task_type: 'local_bash', description: 'fixture watcher', ambient: true },
    ]);
    expect(hasQueryBackgroundTasks(query)).toBe(true);
    expect(hasQueryBackgroundWork(query)).toBe(false);
  });

  it('does not lend the replacement Query activity to an old waiter', () => {
    const retired = {} as Query;
    const current = {} as Query;
    setQuerySession(retired);
    setQuerySession(current);
    replaceQueryBackgroundActivity(current, [
      { task_id: 'current-work', task_type: 'local_agent', description: 'fixture work', run_id: 'run-1' },
    ]);
    expect(hasQueryBackgroundWork(retired)).toBe(false);
    expect(hasQueryBackgroundWork(current)).toBe(true);
    replaceQueryBackgroundActivity(retired, []);
    expect(hasQueryBackgroundWork(current)).toBe(true);
  });

  it('quarantines only the waiting Query and releases it on replacement', async () => {
    const retired = {} as Query;
    const current = {} as Query;
    setQuerySession(retired);
    const waiting = waitForQueryExit(retired);
    expect(isQueryAwaitingExit(retired)).toBe(true);
    expect(isQueryAwaitingExit(current)).toBe(false);
    setQuerySession(current);
    await waiting;
    expect(isQueryAwaitingExit(retired)).toBe(false);
    expect(isQueryAwaitingExit(current)).toBe(false);
  });
});
