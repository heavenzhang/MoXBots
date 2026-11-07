import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BotCareChecks from './BotCareChecks';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), check: vi.fn(), expand: vi.fn(), save: vi.fn() }));
vi.mock('@/api/apiFetch', () => ({ apiGetJson: mocks.get, apiPostJson: mocks.post }));
vi.mock('@/hooks/useWorkspaceFileService', () => ({ useWorkspaceFileService: () => ({ checkPaths: mocks.check, dirExpand: mocks.expand, saveFile: mocks.save }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockResolvedValue({ results: { 'AGENTS.md': { exists: true, type: 'file' } } });
  mocks.get.mockResolvedValue({ success: true, skills: [{ enabled: true }], integrityIssues: [] });
  mocks.expand.mockResolvedValue({ children: [], loaded: true });
});
describe('Separate read-only capability configuration checks', () => {
  it('does nothing until explicitly run and sends only a scoped read', async () => {
    render(<BotCareChecks agentDir="/workspace/Bot A" />);
    expect(mocks.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '运行配置检查' }));
    expect(await screen.findByText('AGENTS.md')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('/api/project-capabilities?agentDir=%2Fworkspace%2FBot%20A');
    expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText(/不代表任务能力已通过验证/)).toBeInTheDocument();
  });
  it('reports unavailable skills separately instead of showing a successful test', async () => {
    mocks.get.mockRejectedValue(new Error('Sidecar unavailable'));
    render(<BotCareChecks agentDir="/bot-a" />);
    fireEvent.click(screen.getByRole('button', { name: '运行配置检查' }));
    expect(await screen.findByText('Sidecar unavailable')).toBeInTheDocument();
    expect(screen.getByText('读取失败')).toBeInTheDocument();
    expect(screen.getByText('AGENTS.md')).toBeInTheDocument();
  });
  it('does not publish results from a closed Bot', async () => {
    let finish!: (value: unknown) => void;
    mocks.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<BotCareChecks agentDir="/bot-a" />);
    fireEvent.click(screen.getByRole('button', { name: '运行配置检查' }));
    view.unmount();
    await act(async () => finish({ success: true, skills: [], integrityIssues: [] }));
    expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
