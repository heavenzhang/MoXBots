import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import type { Provider } from '@/config/types';
import { i18n } from '@/i18n';
import SimpleChatInput from './SimpleChatInput';
import { ToastProvider } from './Toast';

const workspaceMocks = vi.hoisted(() => ({
  discovery: vi.fn(),
  service: {
    isAvailable: true,
    importBase64Files: vi.fn(),
    copyPaths: vi.fn(),
    addGitignore: vi.fn(),
    prepareUserImageAttachments: vi.fn(),
    searchFiles: vi.fn(),
    searchFilesPage: vi.fn(),
    listSlashCommands: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: workspaceMocks.discovery }));
vi.mock('@/config/useConfigData', () => ({
  useConfigData: () => ({ config: { chatSendShortcut: 'enter' }, projects: [] }),
}));
vi.mock('@/hooks/useWorkspaceFileService', () => ({
  useWorkspaceFileService: () => workspaceMocks.service,
}));

const provider = {
  id: 'fixture', name: 'Fixture', vendor: 'custom', cloudProvider: 'fixture', type: 'api',
  isBuiltin: false, config: {}, primaryModel: 'claude-sonnet-5-5',
  models: [
    { model: 'claude-sonnet-5-5', modelName: 'Sonnet 5.5' },
    { model: 'claude-opus-5-5', modelName: 'Opus 5.5' },
  ],
} as Provider;

function renderInput(props: Partial<React.ComponentProps<typeof SimpleChatInput>> = {}) {
  render(
    <ToastProvider>
      <ImagePreviewProvider>
        <SimpleChatInput
          runtime="builtin"
          isLoading={false}
          onSend={vi.fn()}
          provider={provider}
          providers={[provider]}
          availableProviderIds={[provider.id]}
          selectedModel="claude-sonnet-5-5"
          {...props}
        />
      </ImagePreviewProvider>
    </ToastProvider>,
  );
}

afterEach(cleanup);
beforeEach(async () => {
  workspaceMocks.discovery.mockResolvedValue({ items: [], complete: true, networkStatus: 'connecting', authGeneration: 0, principalId: null, networkId: null });
  workspaceMocks.service.listSlashCommands.mockResolvedValue([]);
  workspaceMocks.service.searchFilesPage.mockResolvedValue({ items: [], complete: true, hasMore: false, scanLimitReached: false, nextCursor: null });
  await i18n.changeLanguage('zh-CN');
});

describe('SimpleChatInput 「自动」 model row', () => {
  it('auto Sessions show 「自动 · 模型」 and the auto row as the selection', () => {
    renderInput({ modelMode: 'auto', onAutoModelSelect: vi.fn(), onBuiltinModelSelect: vi.fn() });
    expect(screen.getByTitle('切换模型')).toHaveTextContent('自动 · Sonnet 5.5');
    fireEvent.click(screen.getByTitle('切换模型'));
    const auto = document.querySelector('[data-auto-model-row]')!;
    expect(auto).toHaveAttribute('aria-pressed', 'true');
    expect(auto).toHaveAttribute('data-selected-model-row', '');
    // The concrete model is not marked selected while auto owns the choice.
    expect(screen.getByRole('button', { name: /^Sonnet 5.5/ })).not.toHaveAttribute('data-selected-model-row');
  });

  it('a manual Session picks auto through onAutoModelSelect', () => {
    const onAutoModelSelect = vi.fn();
    renderInput({ modelMode: 'manual', onAutoModelSelect, onBuiltinModelSelect: vi.fn() });
    expect(screen.getByTitle('切换模型')).toHaveTextContent(/^Sonnet 5.5$/);
    fireEvent.click(screen.getByTitle('切换模型'));
    const auto = document.querySelector('[data-auto-model-row]') as HTMLElement;
    expect(auto).toHaveAttribute('aria-pressed', 'false');
    // The trigger itself is also named "Sonnet 5.5" in manual mode; check the menu row.
    const rows = screen.getAllByRole('button', { name: /^Sonnet 5.5/ }).filter(el => el.title !== '切换模型');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-selected-model-row', '');
    fireEvent.click(auto);
    expect(onAutoModelSelect).toHaveBeenCalledOnce();
  });

  it('picking a concrete model goes through the builtin selection owner', () => {
    const onBuiltinModelSelect = vi.fn();
    const onAutoModelSelect = vi.fn();
    renderInput({ modelMode: 'auto', onAutoModelSelect, onBuiltinModelSelect });
    fireEvent.click(screen.getByTitle('切换模型'));
    fireEvent.click(screen.getByRole('button', { name: /^Opus 5.5/ }));
    expect(onBuiltinModelSelect).toHaveBeenCalledWith({ providerId: 'fixture', model: 'claude-opus-5-5' });
    expect(onAutoModelSelect).not.toHaveBeenCalled();
  });

  it('hides the row when the surface offers no auto routing (external runtime, disabled)', () => {
    renderInput({ modelMode: 'auto', onBuiltinModelSelect: vi.fn() });
    expect(screen.getByTitle('切换模型')).toHaveTextContent(/^Sonnet 5.5$/);
    fireEvent.click(screen.getByTitle('切换模型'));
    expect(document.querySelector('[data-auto-model-row]')).toBeNull();
  });
});
