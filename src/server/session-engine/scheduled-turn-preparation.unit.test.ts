import { describe, expect, it, vi } from 'vitest';
import { TASK_ALIGNMENT_SKILL_REQUIREMENT } from '../../shared/systemSkills';
import { createScheduledDispatchGuard } from './scheduled-turn-preparation';
import type { DispatchGuard } from '../session-core/turn-queue';

describe('system skill guard composition', () => {
  it('preserves the preceding synchronous commit recheck after awaited skill preparation', async () => {
    let changed = false;
    const rollback = Promise.resolve();
    const validateAtCommit = vi.fn(() => changed
      ? { accepted: false, code: 'stale', rollbackBeforeReject: rollback }
      : { accepted: true });
    const guard = createScheduledDispatchGuard({
      preceding: async () => ({ accepted: true, validateAtCommit }),
      requiredSystemSkill: TASK_ALIGNMENT_SKILL_REQUIREMENT,
      requireNativeSystemSkill: async () => { changed = true; },
    });
    const result = await guard();
    expect(result.validateAtCommit).toBe(validateAtCommit);
    expect(result.validateAtCommit?.()).toEqual({ accepted: false, code: 'stale', rollbackBeforeReject: rollback });
  });

  it('rolls back a preceding claim on skill failure and forwards cancellation completion', async () => {
    const cancel = vi.fn(async () => {});
    const preceding: DispatchGuard = Object.assign(async () => ({ accepted: true }), { cancel });
    const guard = createScheduledDispatchGuard({ preceding,
      requiredSystemSkill: TASK_ALIGNMENT_SKILL_REQUIREMENT,
      requireNativeSystemSkill: async () => { throw new Error('skill unavailable'); },
    });
    const result = await guard();
    expect(result.accepted).toBe(false);
    await result.rollbackBeforeReject;
    expect(cancel).toHaveBeenCalledOnce();
    await guard.cancel?.();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
