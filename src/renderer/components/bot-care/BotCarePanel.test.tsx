import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BotCarePanel from './BotCarePanel';

const mocks = vi.hoisted(() => ({ editing: false, warning: vi.fn(), start: vi.fn(), close: vi.fn(), create: vi.fn(),
  data: { config: { agents: [
    { id: 'a', name: 'Alpha', enabled: false, model: 'Model A' },
    { id: 'b', name: 'Beta', enabled: true, model: 'Model B' },
  ] }, projects: [{ id: 'pa', agentId: 'a', name: 'Alpha workspace', path: '/bot-a' }, { id: 'pb', agentId: 'b', name: 'Beta workspace', path: '/bot-b' }], isLoading: false, error: null },
}));
vi.mock('@/config/useConfigData', () => ({ useConfigData: () => mocks.data }));
vi.mock('@/config/useConfigActions', () => ({ useConfigActions: () => ({ refreshConfig: vi.fn() }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ warning: mocks.warning, error: vi.fn() }) }));
vi.mock('@/components/AgentSettings', () => ({ WorkspaceGeneralTab: () => <div>Real settings adapter</div> }));
vi.mock('@/components/AgentSettings/AgentIdentityConflicts', () => ({ default: () => <div>Identity conflict</div> }));
vi.mock('./BotCareDocuments', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return { default: forwardRef(function Docs({ agentDir, kind }: { agentDir: string; kind: string }, ref) {
    useImperativeHandle(ref, () => ({ isEditing: () => mocks.editing }));
    return <div data-testid="docs" data-workspace={agentDir}>{kind}</div>;
  }) };
});
vi.mock('./BotCareSkills', () => ({ default: () => <div>Skills</div> }));
vi.mock('./BotCareChecks', () => ({ default: ({ agentDir }: { agentDir: string }) => <div data-testid="checks">{agentDir}</div> }));
const renderPanel = () => render(<BotCarePanel onClose={mocks.close} onCreateBot={mocks.create} onStartWork={mocks.start} />);
const select = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Bot 名册' })).getByRole('button', { name: new RegExp(name) }));

beforeEach(() => { vi.clearAllMocks(); mocks.editing = false; mocks.data.projects[0].path = '/bot-a'; });
describe('My Bots integration surface', () => {
  it('binds the selected real Bot identity and keeps inactive proactive Bots available for work', () => {
    renderPanel(); select('Alpha');
    expect(screen.getByTestId('docs')).toHaveAttribute('data-workspace', '/bot-a');
    fireEvent.click(screen.getByRole('button', { name: '开始工作' }));
    expect(mocks.start).toHaveBeenCalledWith(mocks.data.projects[0]);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it('never starts formal work from capability tests or memory navigation', () => {
    renderPanel(); select('Beta');
    fireEvent.click(screen.getByRole('button', { name: '能力检查' }));
    expect(screen.getByTestId('checks')).toHaveTextContent('/bot-b');
    fireEvent.click(screen.getByRole('tab', { name: '知识与记忆' }));
    expect(screen.getByTestId('docs')).toHaveAttribute('data-workspace', '/bot-b');
    expect(screen.getByTestId('docs')).toHaveTextContent('memory');
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('blocks Bot switching, tabs, work launch, creation and close while a document is open', () => {
    renderPanel(); select('Alpha'); mocks.editing = true;
    select('Beta');
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    fireEvent.click(screen.getByRole('button', { name: '开始工作' }));
    fireEvent.click(screen.getByRole('button', { name: '新建 Bot' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭我的 Bots' }));
    expect(screen.getByTestId('docs')).toHaveAttribute('data-workspace', '/bot-a');
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalled();
    mocks.editing = false; select('Beta');
    expect(screen.getByTestId('docs')).toHaveAttribute('data-workspace', '/bot-b');
  });
  it('retains the open editor and original scope when live config changes the Bot workspace', () => {
    const view = renderPanel(); select('Alpha'); mocks.editing = true;
    const editor = screen.getByTestId('docs');
    mocks.data.projects[0] = { ...mocks.data.projects[0], path: '/replacement' };
    mocks.data.projects = [...mocks.data.projects];
    view.rerender(<BotCarePanel onClose={mocks.close} onCreateBot={mocks.create} onStartWork={mocks.start} />);
    expect(screen.getByTestId('docs')).toBe(editor);
    expect(editor).toHaveAttribute('data-workspace', '/bot-a');
    expect(screen.getByRole('button', { name: '开始工作' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('工作区关联已变化');
  });
  it('supports arrow-key tab navigation and respects open editor admission', () => {
    renderPanel(); select('Alpha');
    const definition = screen.getByRole('tab', { name: '定义' });
    fireEvent.keyDown(definition, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '技能' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '定义' }));
    mocks.editing = true;
    fireEvent.keyDown(definition, { key: 'ArrowRight' });
    expect(definition).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('docs')).toBeInTheDocument();
  });
  it('filters the roster without discarding the selected Bot or its draft', () => {
    renderPanel(); select('Alpha'); mocks.editing = true;
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 Bot' }), { target: { value: 'Beta' } });
    expect(screen.getByTestId('docs')).toHaveAttribute('data-workspace', '/bot-a');
    expect(within(screen.getByRole('navigation')).queryByRole('button', { name: /Alpha/ })).toBeNull();
  });
});
