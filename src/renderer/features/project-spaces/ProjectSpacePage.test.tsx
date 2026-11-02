import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../../../shared/types/agent';
import type { ProjectSpace } from '../../../shared/projectSpaces';
import ProjectSpacePage from './ProjectSpacePage';

const mocks = vi.hoisted(() => ({
  config: { agents: [] as AgentConfig[], projectSpaces: [] as ProjectSpace[] },
  data: { sessions: [], isSessionsLoading: false, sessionsError: null as string | null, refresh: vi.fn() },
  mutate: vi.fn(), reload: vi.fn(),
}));
vi.mock('@/config/useConfigData', () => ({ useConfigData: () => ({ config: mocks.config }) }));
vi.mock('@/hooks/useTaskCenterData', () => ({ useTaskCenterData: () => mocks.data }));
vi.mock('@/config/services/projectSpaceService', () => ({ mutateProjectSpace: mocks.mutate, loadProjectSpace: mocks.reload }));

function space(id: string): ProjectSpace {
  return { id, name: `Project ${id}`, description: `${id} goal`, instructions: '', memberBotIds: ['bot'], materials: [], resources: [], revision: 1, createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' };
}
function binding() { return { onNewConversation: vi.fn(), onOpenConversation: vi.fn(), onCreateBot: vi.fn() }; }

describe('ProjectSpacePage actual product wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.mutate.mockReset(); mocks.reload.mockReset();
    mocks.config = { agents: [{ id: 'bot', name: 'Shared Bot', enabled: true, permissionMode: 'plan', channels: [] }], projectSpaces: [space('a'), space('b')] };
    mocks.data.sessionsError = null;
  });

  it('passes distinct project IDs for the same Bot and retains the original Bot creation entrance', () => {
    const callbacks = binding();
    const view = render(<ProjectSpacePage projectId="a" isActive {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Shared Bot · 与此 Bot 新建对话' }));
    expect(callbacks.onNewConversation).toHaveBeenLastCalledWith('a', 'bot');
    view.rerender(<ProjectSpacePage projectId="b" isActive {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Shared Bot · 与此 Bot 新建对话' }));
    expect(callbacks.onNewConversation).toHaveBeenLastCalledWith('b', 'bot');
    fireEvent.click(screen.getAllByRole('button', { name: '新对话' })[0]);
    expect(callbacks.onNewConversation).toHaveBeenLastCalledWith('b', undefined);
    fireEvent.click(screen.getByRole('tab', { name: /成员/ }));
    fireEvent.click(screen.getByRole('button', { name: /新建 Bot/ }));
    expect(callbacks.onCreateBot).toHaveBeenCalledOnce();
  });

  it('renders the committed save immediately while old configuration projection remains stale', async () => {
    const saved = { ...space('a'), name: 'Saved in original config owner', revision: 2 };
    mocks.mutate.mockResolvedValue(saved);
    const callbacks = binding();
    const view = render(<ProjectSpacePage projectId="a" isActive {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: saved.name } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存项目' })); });
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'update', id: 'a', expectedRevision: 1, draft: expect.objectContaining({ name: saved.name }) }));
    expect(screen.getByRole('heading', { level: 1, name: saved.name })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('项目已保存');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.config.projectSpaces[0].revision).toBe(1);
    view.rerender(<ProjectSpacePage projectId="a" isActive {...callbacks} />);
    expect(screen.getByRole('heading', { level: 1, name: saved.name })).toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledOnce();
  });
});
