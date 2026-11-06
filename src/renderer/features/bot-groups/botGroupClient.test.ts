import { describe, expect, it, vi } from 'vitest';
import { groupCommand, groupFixture } from '../../../test/fixtures/botGroup';
import { readBotGroupConfiguration, saveBotGroupConfiguration } from './botGroupClient';

describe('group configuration through the original Tab', () => {
  it('sends only the strict command once and requires a matching saved receipt', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, sessionId: 's1', group: groupFixture() });
    expect(await saveBotGroupConfiguration(groupCommand, post, () => true)).toEqual(groupFixture());
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/session/task-orchestration/bot-group', groupCommand);
    post.mockResolvedValue({ success: true, sessionId: 's1', group: groupFixture({ receipts: [] }) });
    await expect(saveBotGroupConfiguration(groupCommand, post, () => true)).rejects.toMatchObject({ disposition: 'unconfirmed' });
    post.mockClear();
    await expect(saveBotGroupConfiguration({ ...groupCommand, memberBotIds: ['root', 'root'] }, post, () => true)).rejects.toMatchObject({ disposition: 'rejected', code: 'BOT_GROUP_INVALID_CONFIGURATION' });
    expect(post).not.toHaveBeenCalled();
  });
  it('never retries unknown transport outcomes and only classifies known server rejections', async () => {
    for (const error of [new Error('offline'), Object.assign(new Error('BOT_GROUP_REVISION_CONFLICT'), { status: 502 }), Object.assign(new Error('unknown'), { status: 409 })]) {
      const post = vi.fn().mockRejectedValue(error);
      await expect(saveBotGroupConfiguration(groupCommand, post, () => true)).rejects.toMatchObject({ disposition: 'unconfirmed' });
      expect(post).toHaveBeenCalledOnce();
    }
    const post = vi.fn().mockRejectedValue(Object.assign(new Error('BOT_GROUP_REVISION_CONFLICT'), { status: 409 }));
    await expect(saveBotGroupConfiguration(groupCommand, post, () => true)).rejects.toMatchObject({ disposition: 'rejected', code: 'BOT_GROUP_REVISION_CONFLICT' });
  });
  it('rejects wrong-session and malformed success responses', async () => {
    for (const response of [{ success: true, sessionId: 'other', group: groupFixture() }, { success: true, sessionId: 's1', group: groupFixture({ groupId: 'other' }) }, { success: true, sessionId: 's1', group: {} }]) {
      await expect(saveBotGroupConfiguration(groupCommand, vi.fn().mockResolvedValue(response), () => true)).rejects.toMatchObject({ disposition: 'unconfirmed' });
    }
  });
  it('rejects scope changes before sending and after receipt without another request', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, sessionId: 's1', group: groupFixture() });
    await expect(saveBotGroupConfiguration(groupCommand, post, () => false)).rejects.toMatchObject({ disposition: 'scope-changed' });
    expect(post).not.toHaveBeenCalled();
    let current = true; post.mockImplementation(async () => { current = false; return { success: true, sessionId: 's1', group: groupFixture() }; });
    await expect(saveBotGroupConfiguration(groupCommand, post, () => current)).rejects.toMatchObject({ disposition: 'scope-changed' });
    expect(post).toHaveBeenCalledOnce();
  });
  it('reconciles through read-only snapshot and distinguishes absent group from invalid data', async () => {
    const get = vi.fn().mockResolvedValue({ success: true, sessionId: 's1', ledger: { revision: 1 } });
    expect(await readBotGroupConfiguration('s1', get, () => true)).toBeUndefined();
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/session/task-orchestration?sessionId=s1');
    get.mockResolvedValue({ success: true, sessionId: 's1', ledger: { revision: 2, botGroup: groupFixture() } });
    expect(await readBotGroupConfiguration('s1', get, () => true)).toEqual(groupFixture());
    get.mockResolvedValue({ success: true, sessionId: 's1', ledger: { revision: 3, botGroup: {} } });
    await expect(readBotGroupConfiguration('s1', get, () => true)).rejects.toThrow();
    get.mockResolvedValue({ success: true, sessionId: 'other', ledger: { revision: 1 } });
    await expect(readBotGroupConfiguration('s1', get, () => true)).rejects.toThrow('BOT_GROUP_READ_FAILED');
  });
});
