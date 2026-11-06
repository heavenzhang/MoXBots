import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { groupFixture, groupProject } from '../../../test/fixtures/botGroup';
import { compileProjectSpaceSessionSnapshot } from '../../../shared/projectSpaces';
import { BotGroupSaveError } from './botGroupClient';
import SessionBotGroupEditor from './SessionBotGroupEditor';
const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown>, config: {} as Record<string, unknown>, loadConfig: vi.fn(), loadProjects: vi.fn() }));
vi.mock('@/config/useConfigData', () => ({ useConfigData: () => mocks.config }));
vi.mock('@/components/agent-status/useSessionTaskOrchestration', () => ({ useSessionTaskOrchestrationContext: () => mocks.state }));
vi.mock('@/config/services/appConfigService', () => ({ loadAppConfig: () => mocks.loadConfig() }));
vi.mock('@/config/services/projectService', () => ({ loadProjects: () => mocks.loadProjects() }));
const bots = groupFixture().members.map(member => ({ id: member.botId, name: member.name, enabled: true }));
const workspaces = bots.map(bot => ({ id: bot.id, agentId: bot.id, path: `/demo/${bot.id}` }));
const projectSnapshot = compileProjectSpaceSessionSnapshot({ selection: { projectId: 'project', botId: 'root', projectRevision: 1 }, projectSpaces: [groupProject], bots, workspaces, workspacePath: '/demo/root', capturedAt: groupProject.createdAt });
beforeEach(() => {
  vi.clearAllMocks(); mocks.state = { sessionId: 's1', epoch: 0, botGroup: groupFixture(), botGroupUnknown: false, saveBotGroup: vi.fn(), reloadBotGroup: vi.fn() };
  mocks.config = { config: { projectSpaces: [groupProject], agents: bots }, projects: workspaces };
});
describe('Session group editor uses existing owners', () => {
  it('keeps drafts during snapshot failure and blocks saving until the original observer recovers', () => {
    const onClose = vi.fn(); const { rerender } = render(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('群组名称'), { target: { value: '保留草稿' } });
    mocks.state = { ...mocks.state, botGroupUnknown: true }; rerender(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    expect(screen.getByLabelText('群组名称')).toHaveValue('保留草稿'); expect(screen.getByRole('button', { name: '保存群组' })).toBeDisabled();
    mocks.state = { ...mocks.state, botGroupUnknown: false }; rerender(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    expect(screen.getByLabelText('群组名称')).toHaveValue('保留草稿'); expect(screen.getByRole('button', { name: '保存群组' })).toBeEnabled();
  });
  it('rebases against fresh original catalogs and requires removal of a no-longer-enabled member', async () => {
    const onClose = vi.fn(), save = vi.fn().mockRejectedValue(new BotGroupSaveError('rejected', 'BOT_GROUP_PROJECT_CHANGED'));
    mocks.state.saveBotGroup = save; mocks.state.reloadBotGroup = vi.fn().mockResolvedValue(groupFixture({ revision: 2 }));
    mocks.loadConfig.mockResolvedValue({ projectSpaces: [{ ...groupProject, revision: 2 }], agents: bots.map(bot => ({ ...bot, enabled: bot.id === 'root' })) });
    mocks.loadProjects.mockResolvedValue(workspaces);
    render(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存群组' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '读取最新配置' })));
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，按最新版本继续' }));
    expect(screen.getByRole('button', { name: '保存群组' })).toBeDisabled();
    expect(screen.getAllByText('当前不可用，请检查项目成员或 Bot 配置').length).toBeGreaterThan(0);
    expect(save).toHaveBeenCalledOnce(); expect(mocks.loadConfig).toHaveBeenCalledOnce(); expect(mocks.loadProjects).toHaveBeenCalledOnce();
  });
  it('does not reuse a draft across observer epochs or a different Session', () => {
    const onClose = vi.fn(); const { rerender } = render(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('群组名称'), { target: { value: '旧会话草稿' } });
    mocks.state = { ...mocks.state, epoch: 2, botGroupUnknown: true }; rerender(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mocks.state = { ...mocks.state, botGroupUnknown: false }; rerender(<SessionBotGroupEditor sessionId="s1" projectSnapshot={projectSnapshot} onClose={onClose} />);
    expect(screen.getByLabelText('群组名称')).toHaveValue('产品协作');
    rerender(<SessionBotGroupEditor sessionId="other" projectSnapshot={projectSnapshot} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
