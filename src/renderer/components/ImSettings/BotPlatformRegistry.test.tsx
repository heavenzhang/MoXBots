import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstalledPlugin } from '../../../shared/types/im';
import type { Project } from '@/config/types';
import BotPlatformRegistry from './BotPlatformRegistry';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/utils/browserMock', () => ({
  isTauriEnvironment: () => true,
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function plugin(pluginId: string, npmSpec: string): InstalledPlugin {
  return {
    pluginId,
    npmSpec,
    installDir: `/tmp/${pluginId}`,
    manifest: { name: pluginId, description: pluginId },
    packageVersion: '1.0.0',
  };
}

function promotedCard(name: string): HTMLElement {
  const image = screen.getByAltText(name);
  const card = image.closest('.group');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Card not found for ${name}`);
  }
  return card;
}

describe('BotPlatformRegistry', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('keeps promoted install state isolated when installs start concurrently', async () => {
    const wecomInstall = deferred<InstalledPlugin>();
    const weixinInstall = deferred<InstalledPlugin>();

    invokeMock.mockImplementation((command: string, args?: { npmSpec?: string }) => {
      if (command === 'cmd_list_openclaw_plugins') return Promise.resolve([]);
      if (command === 'cmd_install_openclaw_plugin' && args?.npmSpec === '@wecom/wecom-openclaw-plugin') {
        return wecomInstall.promise;
      }
      if (command === 'cmd_install_openclaw_plugin' && args?.npmSpec === '@tencent-weixin/openclaw-weixin') {
        return weixinInstall.promise;
      }
      return Promise.reject(new Error(`Unexpected invoke: ${command}`));
    });

    render(<BotPlatformRegistry projects={[]} agents={[]} onAddToWorkspace={vi.fn()} />);

    await waitFor(() => {
      expect(within(promotedCard('企业微信')).getByRole('button', { name: '安装' })).toBeEnabled();
      expect(within(promotedCard('微信')).getByRole('button', { name: '安装' })).toBeEnabled();
    });

    fireEvent.click(within(promotedCard('企业微信')).getByRole('button', { name: '安装' }));
    await waitFor(() => {
      expect(within(promotedCard('企业微信')).getByRole('button', { name: '安装中' })).toBeDisabled();
    });

    fireEvent.click(within(promotedCard('微信')).getByRole('button', { name: '安装' }));

    await waitFor(() => {
      expect(within(promotedCard('企业微信')).getByRole('button', { name: '安装中' })).toBeDisabled();
      expect(within(promotedCard('微信')).getByRole('button', { name: '安装中' })).toBeDisabled();
    });

    weixinInstall.resolve(plugin('openclaw-weixin', '@tencent-weixin/openclaw-weixin'));

    await waitFor(() => {
      expect(within(promotedCard('企业微信')).getByRole('button', { name: '安装中' })).toBeDisabled();
      expect(within(promotedCard('微信')).getByText('v1.0.0')).toBeInTheDocument();
      expect(within(promotedCard('微信')).getByRole('button', { name: '绑定到 Bot' })).toBeEnabled();
      expect(screen.queryByRole('heading', { name: '选择工作区' })).not.toBeInTheDocument();
    });

    wecomInstall.resolve(plugin('wecom-openclaw-plugin', '@wecom/wecom-openclaw-plugin'));

    await waitFor(() => {
      expect(within(promotedCard('企业微信')).getByText('v1.0.0')).toBeInTheDocument();
      expect(within(promotedCard('微信')).getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('opens the workspace picker from an available bot and returns the chosen project and platform', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'cmd_list_openclaw_plugins') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected invoke: ${command}`));
    });
    const project: Project = {
      id: 'mino',
      name: 'mino',
      agentId: 'bot-mino',
      path: '/workspace/mino',
      providerId: null,
      permissionMode: null,
    };
    const onAddToWorkspace = vi.fn();

    render(
      <BotPlatformRegistry
        projects={[project]}
        agents={[{ id: 'bot-mino', name: 'mino', enabled: false, permissionMode: 'auto', channels: [] }]}
        onAddToWorkspace={onAddToWorkspace}
      />,
    );

    await waitFor(() => expect(within(promotedCard('Telegram')).getByRole('button', { name: '绑定到 Bot' })).toBeEnabled());
    fireEvent.click(within(promotedCard('Telegram')).getByRole('button', { name: '绑定到 Bot' }));
    expect(screen.getByRole('heading', { name: '选择要绑定的 Bot' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mino/u }));

    expect(onAddToWorkspace).toHaveBeenCalledWith('telegram', project);
  });
  it.each([
    ['飞书', 'openclaw-lark', '@larksuite/openclaw-lark'],
    ['企业微信', 'wecom-openclaw-plugin', '@wecom/wecom-openclaw-plugin'],
    ['微信', 'openclaw-weixin', '@tencent-weixin/openclaw-weixin'],
  ])('binds an installed %s identity to the selected existing Bot', async (name, id, spec) => {
    invokeMock.mockResolvedValue([plugin(id, spec)]);
    const project: Project = { id: 'p', agentId: 'existing-bot', name: 'folder',
      path: '/test/bot', providerId: null, permissionMode: null };
    const onAddToWorkspace = vi.fn();
    render(<BotPlatformRegistry projects={[project]} agents={[{
      id: 'existing-bot', name: '已有销售 Bot', enabled: false, permissionMode: 'auto', channels: [],
    }]} onAddToWorkspace={onAddToWorkspace} />);
    await waitFor(() => expect(within(promotedCard(name)).getByRole('button', { name: '绑定到 Bot' })).toBeEnabled());
    fireEvent.click(within(promotedCard(name)).getByRole('button', { name: '绑定到 Bot' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onAddToWorkspace).not.toHaveBeenCalled();
    fireEvent.click(within(promotedCard(name)).getByRole('button', { name: '绑定到 Bot' }));
    fireEvent.click(screen.getByRole('button', { name: /已有销售 Bot/ }));
    expect(onAddToWorkspace).toHaveBeenCalledWith(`openclaw:${id}`, project);
    expect(invokeMock.mock.calls.every(([command]) => command === 'cmd_list_openclaw_plugins')).toBe(true);
  });

});
