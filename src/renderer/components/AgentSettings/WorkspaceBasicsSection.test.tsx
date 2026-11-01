import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Provider } from '@/config/types';
import type { AgentConfig } from '@/../shared/types/agent';
import WorkspaceBasicsSection from './WorkspaceBasicsSection';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  patch: vi.fn(),
  refresh: vi.fn(),
  providers: [{
    id: 'test-provider', name: 'Test Provider', vendor: 'Test', cloudProvider: 'Test',
    type: 'api', primaryModel: 'test-model', isBuiltin: false, config: {},
    models: [{ model: 'test-model', modelName: 'Test Model', modelSeries: 'test' }],
  }] satisfies Provider[],
}));

vi.mock('@/hooks/useConfig', () => ({ useConfig: () => ({
  config: {  },
  providers: mocks.providers,
  apiKeys: { 'test-provider': 'test-only-placeholder' },
  providerVerifyStatus: {},
  patchProject: vi.fn(),
  refreshConfig: mocks.refresh,
}) }));
vi.mock('@/config/configService', () => ({
  getAllMcpServers: async () => [{ id: 'test-tool', name: 'Test Tool', type: 'stdio', isBuiltin: false }],
  getEnabledMcpServerIds: async () => ['test-tool'],
}));
vi.mock('@/config/services/agentConfigService', () => ({
  patchAgentConfig: vi.fn(), patchAgentProjectConfig: mocks.patch,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => ({ builtin: { installed: true } }) }));
vi.mock('@/hooks/useBrowserResourceReady', () => ({ useBrowserResourceReady: () => true }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ error: mocks.error, success: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));

const project: Project = {
  id: 'test-project', name: 'Test Workspace', path: '/test-workspace',
  providerId: 'test-provider', permissionMode: 'plan',
};
const agent: AgentConfig = {
  id: 'test-agent', name: 'Test Agent', enabled: true, channels: [],
  providerId: 'test-provider', model: 'test-model', permissionMode: 'plan',
  runtimePreference: { family: 'integrated', id: 'claude-agent-sdk' },
};

describe('Workspace basics menus', () => {
  it.each([['青芽', 'bot:moss'], ['默认', '']])('saves %s to both identities without changing workspace or execution configuration', async (label, icon) => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkspaceBasicsSection project={{ ...project, icon: 'bot:mox' }} agent={agent} agentDir={project.path} />);
    await user.click(screen.getByRole('button', { name: '选择 Bot 形象' }));
    await user.click(label === '默认' ? screen.getByTitle('默认') : screen.getByRole('button', { name: label }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('test-agent', { icon }, 'test-project', { icon }));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '选择 Bot 形象' })).toHaveAttribute('aria-expanded', 'false');
    rerender(<WorkspaceBasicsSection project={{ ...project, icon }} agent={{ ...agent, icon }} agentDir={project.path} />);
    expect(screen.getByRole('textbox', { name: 'Bot 名称' })).toHaveValue(project.name);
    expect(screen.getByTitle(project.path)).toHaveTextContent(project.path);
  });

  it('retains the picker and reports an avatar save failure', async () => {
    mocks.patch.mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    render(<WorkspaceBasicsSection project={project} agent={agent} agentDir={project.path} />);
    await user.click(screen.getByRole('button', { name: '选择 Bot 形象' }));
    await user.click(screen.getByRole('button', { name: '小墨' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('形象保存失败，请重试'));
    expect(screen.getByRole('button', { name: '选择 Bot 形象' })).toHaveAttribute('aria-expanded', 'true');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no layout. Supply a viewport and distinct row positions while
    // exercising the real shared Popover and Floating UI positioning code.
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1024);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(768);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const name = this.textContent;
      const top = this.tagName === 'BUTTON'
        ? name === 'Test Provider / Test Model' ? 100 : name === '默认' ? 200 : name === '未启用工具' ? 300 : 0
        : 0;
      return new DOMRect(this.tagName === 'BUTTON' ? 200 : 0, top, 320, this.tagName === 'BUTTON' ? 32 : 140);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'BUTTON' ? 32 : 140;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['Test Provider / Test Model', 'Test Model', 136],
    ['默认', 'high', 236],
    ['未启用工具', 'Test Tool', 336],
  ] as const)('opens %s below its own row and keeps the trigger usable', async (triggerName, optionName, top) => {
    const user = userEvent.setup();
    const { container } = render(<WorkspaceBasicsSection project={project} agent={agent} agentDir={project.path} />);
    const trigger = screen.getByRole('button', { name: triggerName });
    await user.click(trigger);
    const option = await screen.findByText(optionName, { exact: true });
    const popup = option.closest('[data-floating-ui-portal]')?.firstElementChild;

    expect(popup).toBeTruthy();
    expect(container).not.toContainElement(option);
    await waitFor(() => expect(popup).toHaveStyle({ transform: `translate(200px, ${top}px)` }));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(optionName, { exact: true })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('switches between rows and keeps tools open for multiple selections until an outside click', async () => {
    const user = userEvent.setup();
    render(<WorkspaceBasicsSection project={project} agent={agent} agentDir={project.path} />);
    const model = screen.getByRole('button', { name: 'Test Provider / Test Model' });
    const tools = screen.getByRole('button', { name: '未启用工具' });
    await user.click(model);
    await user.click(tools);
    expect(model).toHaveAttribute('aria-expanded', 'false');
    await user.click(await screen.findByRole('checkbox', { name: 'Test Tool' }));
    expect(tools).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(
      'test-agent', { mcpEnabledServers: ['test-tool'] }, 'test-project', { mcpEnabledServers: ['test-tool'] },
    ));
    fireEvent.mouseDown(document.body);
    expect(tools).toHaveAttribute('aria-expanded', 'false');
  });
});
