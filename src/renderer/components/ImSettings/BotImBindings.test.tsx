import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../../../shared/types/agent';
import type { Project } from '@/config/types';
import { BotImBindingsView } from './BotImBindings';

vi.mock('@/components/AgentSettings/sections/AgentChannelsSection', () => ({
  default: ({ agent, onAgentChanged }: { agent: AgentConfig; onAgentChanged: () => void }) => (
    <button onClick={onAgentChanged}>existing-channel-owner:{agent.id}</button>
  ),
}));

const bot: AgentConfig = {
  id: 'sales', name: 'Sales', enabled: false, permissionMode: 'auto',
  channels: [
    { id: 'lark', type: 'openclaw:openclaw-lark', name: '销售助理', enabled: true,
      allowedUsers: ['user-1', 'user-1'],
      groupPermissions: [
        { groupId: 'approved', groupName: 'approved', status: 'approved', platform: 'feishu', discoveredAt: '' },
        { groupId: 'pending', groupName: 'pending', status: 'pending', platform: 'feishu', discoveredAt: '' },
      ] },
    { id: 'wecom', type: 'openclaw:wecom-openclaw-plugin', enabled: false },
    { id: 'weixin', type: 'openclaw:openclaw-weixin', enabled: true },
  ],
};
const project: Project = {
  id: 'p-sales', agentId: bot.id, name: 'folder-name', displayName: '销售 Bot',
  path: '/test/sales', providerId: null, permissionMode: null,
};

describe('Bot IM binding overview', () => {
  it('groups multiple identities under the existing Bot and uses actual connection observations', () => {
    const onChanged = vi.fn(async () => {});
    render(<BotImBindingsView config={{ agents: [bot] }} projects={[project]} statuses={{
      sales: { agentId: bot.id, agentName: bot.name, enabled: false, channels: [
        { channelId: 'lark', channelType: 'openclaw:openclaw-lark', status: 'online', botUsername: '平台销售助手', uptimeSeconds: 10, activeSessions: [], restartCount: 0, bufferedMessages: 0 },
        { channelId: 'weixin', channelType: 'openclaw:openclaw-weixin', status: 'error', uptimeSeconds: 0, activeSessions: [], restartCount: 0, bufferedMessages: 0 },
      ] },
    }} onChanged={onChanged} />);
    expect(screen.getByRole('heading', { name: '销售 Bot' })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('飞书 · 平台销售助手')).toBeInTheDocument();
    expect(within(rows[0]).getByText('已配对 1 位用户 · 已授权 1 个群')).toBeInTheDocument();
    expect(within(rows[0]).getByText('在线')).toBeInTheDocument();
    expect(within(rows[1]).getByText('状态待确认 · 已停用')).toBeInTheDocument();
    expect(within(rows[2]).getByText('连接异常')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '管理绑定' }));
    fireEvent.click(screen.getByRole('button', { name: 'existing-channel-owner:sales' }));
    expect(onChanged).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByRole('button', { name: 'existing-channel-owner:sales' })).not.toBeInTheDocument();
  });

  it('refreshes from owner data and removes unavailable Bots without stale management controls', () => {
    const props = { config: { agents: [bot] }, projects: [project], statuses: {}, onChanged: vi.fn(async () => {}) };
    const view = render(<BotImBindingsView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '管理绑定' }));
    view.rerender(<BotImBindingsView {...props} config={{ agents: [{ ...bot, channels: [] }] }} />);
    expect(screen.getByText('尚未绑定 IM 身份')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    view.rerender(<BotImBindingsView {...props} projects={[{ ...project, archivedAt: '2026-11-07' }]} />);
    expect(screen.queryByRole('button', { name: 'existing-channel-owner:sales' })).not.toBeInTheDocument();
    expect(screen.getByText(/暂无可绑定的 Bot/)).toBeInTheDocument();
  });
});
