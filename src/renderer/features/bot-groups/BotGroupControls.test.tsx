import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { groupFixture, groupProject } from '../../../test/fixtures/botGroup';
import type { BotGroup } from '../../../shared/botGroup';
import BotGroupEditor, { type BotGroupEditorProps } from './BotGroupEditor';
import BotGroupRecipient from './BotGroupRecipient';
import { BotGroupSaveError } from './botGroupClient';

function props(): BotGroupEditorProps {
  return { sessionId: 's1', rootBotId: 'root', project: groupProject, group: groupFixture(),
    choices: groupFixture().members.map(member => ({ id: member.botId, name: member.name, workspacePath: member.workspacePath, unavailable: false })),
    onSave: vi.fn(), onReload: vi.fn(), onSaved: vi.fn(), onClose: vi.fn() };
}
describe('Bot group membership and explicit recipient', () => {
  it('never chooses a default and invalidates a stale or cross-group target without silent rerouting', () => {
    const onChange = vi.fn(), group = groupFixture();
    const { rerender } = render(<BotGroupRecipient group={group} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '发送给' })).toHaveTextContent('选择接收这条消息的 Bot');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '发送给' }));
    fireEvent.click(screen.getByRole('button', { name: /小墨.*writer/ }));
    const value = { groupId: 's1', botId: 'writer', groupRevision: 1 };
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value);
    rerender(<BotGroupRecipient group={{ ...group, revision: 2 }} value={value} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '发送给' })).toHaveTextContent('选择接收这条消息的 Bot');
    expect(screen.getByRole('status')).toHaveTextContent('重新选择');
    rerender(<BotGroupRecipient group={group} value={{ ...value, groupId: 'other' }} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '发送给' })).toHaveTextContent('选择接收这条消息的 Bot');
    expect(onChange).toHaveBeenCalledOnce();
  });
  it('retains an uncertain draft, checks read-only, and only retries the identical request on explicit action', async () => {
    const p = props(); p.onSave = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(groupFixture());
    p.onReload = vi.fn().mockResolvedValue({ project: groupProject, group: groupFixture({ receipts: [] }) });
    render(<BotGroupEditor {...p} />);
    fireEvent.change(screen.getByLabelText('群组名称'), { target: { value: '我的修改' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存群组' })));
    expect(screen.getByLabelText('群组名称')).toHaveValue('我的修改');
    expect(screen.getByLabelText('群组名称')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '重试原修改' })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '核对保存结果' })));
    expect(p.onSave).toHaveBeenCalledOnce();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '重试原修改' })));
    expect(p.onSave).toHaveBeenCalledTimes(2);
    expect(vi.mocked(p.onSave).mock.calls[1][0]).toBe(vi.mocked(p.onSave).mock.calls[0][0]);
    expect(p.onSaved).toHaveBeenCalledOnce();
  });
  it('recognizes an acknowledged uncertain save without sending again', async () => {
    const p = props(); p.onSave = vi.fn().mockRejectedValue(new Error('offline'));
    p.onReload = vi.fn(async () => ({ project: groupProject, group: groupFixture({ receipts: [{ requestId: vi.mocked(p.onSave).mock.calls[0][0].requestId, digest: 'b'.repeat(64), revision: 1 }] }) }));
    render(<BotGroupEditor {...p} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存群组' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '核对保存结果' })));
    expect(p.onSaved).toHaveBeenCalledOnce(); expect(p.onSave).toHaveBeenCalledOnce();
  });
  it('does not erase the first unknown outcome when a later identical retry is rejected', async () => {
    const p = props(); p.onSave = vi.fn().mockRejectedValueOnce(new Error('lost response'))
      .mockRejectedValueOnce(new BotGroupSaveError('rejected', 'BOT_GROUP_REVISION_CONFLICT'));
    p.onReload = vi.fn().mockResolvedValue({ project: groupProject, group: groupFixture({ receipts: [] }) });
    render(<BotGroupEditor {...p} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存群组' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '核对保存结果' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '重试原修改' })));
    expect(screen.getByLabelText('群组名称')).toBeDisabled();
    expect(screen.getByRole('button', { name: '核对保存结果' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '保留我的修改，按最新版本继续' })).not.toBeInTheDocument();
    expect(p.onSaved).not.toHaveBeenCalled();
  });
  it('preserves conflicting edits until the user reads and explicitly adopts the new revision', async () => {
    const p = props(); p.onSave = vi.fn().mockRejectedValueOnce(new BotGroupSaveError('rejected', 'BOT_GROUP_REVISION_CONFLICT')).mockResolvedValueOnce(groupFixture());
    p.onReload = vi.fn().mockResolvedValue({ project: { ...groupProject, revision: 3 }, group: groupFixture({ revision: 4, title: '另一处修改' }) });
    render(<BotGroupEditor {...p} />);
    fireEvent.change(screen.getByLabelText('群组名称'), { target: { value: '我的修改' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存群组' })));
    expect(screen.getByRole('button', { name: '保存群组' })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '读取最新配置' })));
    expect(screen.getByText(/当前群组：另一处修改/)).toBeInTheDocument();
    expect(screen.getByLabelText('群组名称')).toHaveValue('我的修改');
    expect(screen.getByRole('button', { name: '保存群组' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，按最新版本继续' }));
    expect(p.onSave).toHaveBeenCalledOnce();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存群组' })));
    expect(p.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ title: '我的修改', expectedRevision: 4, projectRevision: 3 }));
    expect(vi.mocked(p.onSave).mock.calls[1][0].requestId).not.toBe(vi.mocked(p.onSave).mock.calls[0][0].requestId);
  });
  it('prevents duplicate submission and ignores completion after the editor unmounts', async () => {
    const p = props(); let finish!: (value: BotGroup) => void;
    p.onSave = vi.fn(() => new Promise<BotGroup>(resolve => { finish = resolve; }));
    const { unmount } = render(<BotGroupEditor {...p} />);
    const save = screen.getByRole('button', { name: '保存群组' });
    fireEvent.click(save); fireEvent.click(save);
    expect(p.onSave).toHaveBeenCalledOnce(); unmount();
    await act(async () => finish(groupFixture()));
    expect(p.onSaved).not.toHaveBeenCalled();
  });
  it('keeps the root member, requires two available Bots and preserves focus/IME behavior', async () => {
    const p = props(); p.group = undefined;
    render(<><button type="button">原入口</button><BotGroupEditor {...p} /></>);
    expect(screen.getByLabelText('群组名称')).toHaveFocus();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked(); expect(checkboxes[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存群组' })).toBeDisabled();
    fireEvent.click(checkboxes[1]); expect(screen.getByRole('button', { name: '保存群组' })).toBeEnabled();
    fireEvent.keyDown(screen.getByLabelText('群组名称'), { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(p.onSave).not.toHaveBeenCalled();
    screen.getByRole('button', { name: '保存群组' }).focus();
    fireEvent.keyDown(screen.getByRole('button', { name: '保存群组' }), { key: 'Tab' });
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus());
  });
});
