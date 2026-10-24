import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import type { Message as MessageType } from '@/types/chat';
import type { AutoRouteRecord } from '../../shared/autoRoute';
import { AutoRouteTagContext, type AutoRouteTagActions } from './AutoRouteTag';

vi.mock('@/context/ImagePreviewContext', () => ({ useImagePreview: () => ({ openPreview: vi.fn() }) }));
vi.mock('@/analytics', () => ({ track: vi.fn() }));
vi.mock('@/context/FileActionContext', () => ({
  useFileAction: () => ({ workspacePath: '/workspace', openFileTarget: vi.fn() }),
}));

import Message from './Message';

const record: AutoRouteRecord = {
  tier: 'strong', providerId: 'p', model: 'claude-opus-5-5', effort: 'high',
  reason: 'classified', latencyMs: 412.4, at: '2026-10-21T00:00:00.000Z',
};

function userMsg(autoRoute?: AutoRouteRecord): MessageType {
  return {
    id: 'u1', role: 'user', content: '设计一个同步引擎', timestamp: new Date('2026-10-21T00:00:00Z'),
    metadata: { source: 'desktop', ...(autoRoute ? { autoRoute } : {}) },
  } as MessageType;
}

afterEach(cleanup);
beforeEach(async () => { await i18n.changeLanguage('zh-CN'); });

describe('Message — auto route tag', () => {
  it('shows 「自动 · 模型 · 推理」 with tier, reason and latency on hover', () => {
    const actions: AutoRouteTagActions = { modelLabel: () => 'Fixture · Opus 5.5' };
    render(<AutoRouteTagContext.Provider value={actions}><Message message={userMsg(record)} /></AutoRouteTagContext.Provider>);
    const tag = screen.getByText('自动 · Fixture · Opus 5.5 · 推理 high');
    expect(tag).toHaveAttribute('aria-label', '自动 · Fixture · Opus 5.5 · 推理 high（强力档 · 按难度判断 · 判断耗时 412 ms）');
    // No correction actions unless Chat offers them.
    expect(screen.queryByRole('button', { name: '换一个' })).not.toBeInTheDocument();
  });

  it('offers 「换一个」 and 「以后这类都用它」 when Chat owns the Session', () => {
    const onChooseAnother = vi.fn();
    const onPreferModel = vi.fn();
    render(
      <AutoRouteTagContext.Provider value={{ modelLabel: () => 'Opus 5.5', onChooseAnother, onPreferModel }}>
        <Message message={userMsg(record)} />
      </AutoRouteTagContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '换一个' }));
    expect(onChooseAnother).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '以后这类都用它' }));
    expect(onPreferModel).toHaveBeenCalledWith(record);
  });

  it('renders nothing for turns that were not auto-routed and falls back to the model id', () => {
    const { container, unmount } = render(<Message message={userMsg()} />);
    expect(container.querySelector('[data-auto-route-tag]')).toBeNull();
    unmount();
    render(<Message message={userMsg({ ...record, effort: undefined })} />);
    expect(screen.getByText('自动 · claude-opus-5-5')).toBeInTheDocument();
  });

  it('describes a candidate without claiming a switch and hides tier preference after failed classification', () => {
    const { unmount } = render(<Message message={userMsg({ ...record, backup: { providerId: 'q', model: 'backup' } })} />);
    expect(screen.getByText('自动 · claude-opus-5-5 · 推理 high').getAttribute('aria-label')).toContain('同档接管候选');
    unmount();
    render(<AutoRouteTagContext.Provider value={{ modelLabel: row => row.model, onPreferModel: vi.fn() }}>
      <Message message={userMsg({ ...record, reason: 'classifier-failed', unclassified: true, backupUnavailableReason: 'no-candidate' })} />
    </AutoRouteTagContext.Provider>);
    const label = screen.getByText('自动 · claude-opus-5-5 · 推理 high').getAttribute('aria-label');
    expect(label).toContain('判断失败');
    expect(label).not.toContain('强力档');
    expect(screen.queryByRole('button', { name: '以后这类都用它' })).not.toBeInTheDocument();
  });
});
