import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n';
import type { AgentConfig } from '../../../shared/types/agent';
import type { Project } from '@/config/types';
import { ProjectSpaceError, type ProjectSpace, type ProjectSpaceSessionSnapshot } from '../../../shared/projectSpaces';
import ProjectSpaceEditor from './ProjectSpaceEditor';
import ProjectSpaceView from './ProjectSpaceView';
import ProjectConversationDialog from './ProjectConversationDialog';
import ProjectContextBadge from './ProjectContextBadge';

const at = '2026-11-02T00:00:00.000Z';
const bot: AgentConfig = { id: 'bot', name: 'Review Bot', enabled: true, permissionMode: 'plan', channels: [] };
const workspace: Project = { id: 'workspace', name: 'Bot workspace', path: '/demo/review-bot', agentId: bot.id, providerId: null, permissionMode: null };
function space(id = 'a', revision = 1): ProjectSpace {
  return { id, name: `Project ${id.toUpperCase()}`, description: `Goal ${id}`, instructions: '', memberBotIds: [bot.id], materials: [], resources: [], revision, createdAt: at, updatedAt: at };
}

describe('Project Space interaction regressions', () => {
  it('keeps the local draft after a revision conflict and only rebases after explicit comparison and confirmation', async () => {
    const original = space(), latest = { ...space('a', 2), description: 'Remote goal changed' };
    const onSave = vi.fn().mockRejectedValueOnce(new ProjectSpaceError('revision-conflict', 'stale')).mockResolvedValueOnce({ ...latest, name: 'My retained title', revision: 3 });
    const onReload = vi.fn(async () => latest), onClose = vi.fn();
    render(<ProjectSpaceEditor project={original} bots={[bot]} onSave={onSave} onClose={onClose} {...{ onReload }} />);
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: 'My retained title' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存项目' })); });
    expect(screen.getByLabelText('项目名称')).toHaveValue('My retained title');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'My retained title' }), 1);

    // Loading another writer's revision must not silently replace our draft or
    // change the expected revision. The review action is separately confirmed.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: String(i18n.t('app:projectSpaces.reviewLatest')) })); });
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('项目名称')).toHaveValue('My retained title');
    expect(screen.getByText('Remote goal changed')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: String(i18n.t('app:projectSpaces.confirmDraft')) }));
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存项目' })); });
    expect(onSave).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'My retained title' }), 2);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('retains the current B draft before resuming retained draft A', () => {
    const spaces = [space('a'), space('b')];
    const props = { open: true, spaces, agents: [bot], workspaces: [workspace], onOpen: vi.fn(async () => ({ status: 'not-started' as const })), onClose: vi.fn(), onCreateBot: vi.fn(), onCreateProject: vi.fn(), onViewAttempt: vi.fn() };
    const { rerender } = render(<ProjectConversationDialog {...props} request={{ id: 1, projectId: 'a', botId: bot.id }} />);
    fireEvent.change(screen.getByLabelText('第一条消息（可选）'), { target: { value: 'Original draft A' } });
    rerender(<ProjectConversationDialog {...props} request={{ id: 2, projectId: 'b', botId: bot.id }} />);
    fireEvent.change(screen.getByLabelText('第一条消息（可选）'), { target: { value: 'Current draft B' } });
    fireEvent.click(screen.getByRole('button', { name: '返回新建' }));
    const retained = screen.getByRole('region', { name: '保留的对话记录' });
    const aDetails = within(retained).getByDisplayValue('Original draft A').closest('details')!;
    aDetails.open = true;
    fireEvent.click(within(aDetails).getByRole('button', { name: '继续编辑' }));
    expect(screen.getByLabelText('第一条消息（可选）')).toHaveValue('Original draft A');
    fireEvent.click(screen.getByRole('button', { name: '返回新建' }));
    expect(within(screen.getByRole('region', { name: '保留的对话记录' })).getByDisplayValue('Current draft B')).toHaveAttribute('readonly');
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('ignores a late save of A when the same view has moved to project B', async () => {
    let resolveSave!: (value: ProjectSpace) => void;
    const onSave = vi.fn(() => new Promise<ProjectSpace>(resolve => { resolveSave = resolve; }));
    const props = { bots: [bot], sessions: [], onSave, onArchive: vi.fn(async () => space()), onNewConversation: vi.fn(), onOpenConversation: vi.fn(), onRefresh: vi.fn(), onCreateBot: vi.fn() };
    const { rerender } = render(<ProjectSpaceView {...props} project={space('a')} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: 'Saved A only' } });
    fireEvent.click(screen.getByRole('button', { name: '保存项目' }));
    expect(onSave).toHaveBeenCalledOnce();
    rerender(<ProjectSpaceView {...props} project={space('b')} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Project B' })).toBeInTheDocument();
    await act(async () => { resolveSave({ ...space('a', 10), name: 'Saved A only' }); });
    expect(screen.getByRole('heading', { level: 1, name: 'Project B' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Saved A only' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-project-space]')).toHaveAttribute('data-project-space', 'b');
  });

  it('fences the exact uncertain project intent while allowing a separate empty intent for B', async () => {
    const onOpen = vi.fn().mockResolvedValueOnce({ status: 'uncertain', tabId: 'original-tab' }).mockResolvedValueOnce({ status: 'opened' });
    render(<ProjectConversationDialog open spaces={[space('a'), space('b')]} agents={[bot]} workspaces={[workspace]} request={{ id: 1, projectId: 'a', botId: bot.id }} onOpen={onOpen} onClose={vi.fn()} onCreateBot={vi.fn()} onCreateProject={vi.fn()} onViewAttempt={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('第一条消息（可选）'), { target: { value: 'Original uncertain A' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送并开始' })); });
    expect(screen.getByRole('button', { name: '发送并开始' })).toBeDisabled();
    expect(screen.getByLabelText('第一条消息（可选）')).toHaveAttribute('readonly');
    fireEvent.submit(screen.getByLabelText('第一条消息（可选）').closest('form')!);
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '保留记录并返回新建' }));
    expect(within(screen.getByRole('region', { name: '保留的对话记录' })).getByDisplayValue('Original uncertain A')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: '新对话' }));
    expect(screen.getByLabelText('第一条消息（可选）')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '所属项目' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project B' }));
    fireEvent.click(screen.getByRole('button', { name: '合作 Bot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Bot' }));
    fireEvent.change(screen.getByLabelText('第一条消息（可选）'), { target: { value: 'Independent B' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送并开始' })); });
    expect(onOpen).toHaveBeenNthCalledWith(1, { kind: 'project', selection: { projectId: 'a', botId: bot.id, projectRevision: 1 } }, { text: 'Original uncertain A' });
    expect(onOpen).toHaveBeenNthCalledWith(2, { kind: 'project', selection: { projectId: 'b', botId: bot.id, projectRevision: 1 } }, { text: 'Independent B' });
    expect(within(screen.getByRole('region', { name: '保留的对话记录' })).getByDisplayValue('Original uncertain A')).toHaveAttribute('readonly');
  });

  it('closes frozen project context with Escape and restores focus to its trigger', () => {
    const snapshot: ProjectSpaceSessionSnapshot = { schemaVersion: 1, projectId: 'a', projectName: 'Frozen A', projectRevision: 1, botId: bot.id, botName: bot.name, workspacePath: workspace.path, capturedAt: at, description: 'Original frozen goal', instructions: '', materials: [], resources: [] };
    render(<ProjectContextBadge snapshot={snapshot} />);
    const trigger = screen.getByRole('button', { name: /Frozen A/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Frozen A' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
