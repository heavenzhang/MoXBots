// The current-page titlebar has no legacy tab restore action. Updates and
// explicit native drag regions must remain available after removing the pill.
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isTauri: vi.fn(() => false),
}));

vi.mock('@/api/tauriClient', () => ({ isTauri: () => mocks.isTauri() }));
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
        close: vi.fn(),
        isFullscreen: vi.fn().mockResolvedValue(false),
        isMaximized: vi.fn().mockResolvedValue(false),
        maximize: vi.fn(),
        minimize: vi.fn(),
        unmaximize: vi.fn(),
    }),
}));

import { i18n } from '@/i18n';
import CustomTitleBar from './CustomTitleBar';

function renderBar(over: Partial<React.ComponentProps<typeof CustomTitleBar>> = {}) {
    return render(
        <CustomTitleBar {...over}>
            <div data-testid="tabbar" />
        </CustomTitleBar>,
    );
}

describe('CustomTitleBar — current-page actions', () => {
    beforeEach(async () => {
        mocks.isTauri.mockReturnValue(false);
        await i18n.changeLanguage('zh-CN');
    });

    it('has no legacy restore or dismiss action', () => {
        renderBar();
        expect(screen.queryByText('恢复上次标签页')).not.toBeInTheDocument();
        expect(screen.queryByTitle('忽略')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('shares the global sidebar surface without a bottom divider', () => {
        const { container } = renderBar();
        const titlebar = container.querySelector('.custom-titlebar');

        expect(titlebar).toHaveClass('bg-[var(--global-sidebar-bg)]', 'pl-2');
        expect(titlebar).not.toHaveClass('bg-[var(--paper)]', 'border-b', 'border-[var(--line)]');
        expect(titlebar).not.toHaveClass('bg-gradient-to-b', 'from-[var(--paper)]', 'to-[var(--paper-inset)]/30');
    });

    it('keeps restart/update wiring without the restore pill', () => {
        const onRestartAndUpdate = vi.fn();
        renderBar({ updateReady: true, updateVersion: '0.5.99', onRestartAndUpdate });
        fireEvent.click(screen.getByRole('button', { name: '重启更新' }));
        expect(onRestartAndUpdate).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('恢复上次标签页')).not.toBeInTheDocument();
    });

    it('prevents a second install click and hides a replacing download', () => {
        const onRestartAndUpdate = vi.fn();
        const { rerender } = renderBar({ updateReady: true, updateInstalling: true, onRestartAndUpdate });
        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(onRestartAndUpdate).not.toHaveBeenCalled();
        rerender(<CustomTitleBar updateReady updatePreparing><div /></CustomTitleBar>);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('keeps explicit draggable regions around and between titlebar actions', () => {
        const { container } = renderBar();
        const tauriDragRegions = Array.from(container.querySelectorAll('[data-tauri-drag-region]'));
        const tabbarHost = screen.getByTestId('tabbar').parentElement;

        expect(tauriDragRegions.length).toBeGreaterThanOrEqual(2);
        expect(tauriDragRegions.some((node) => (node as HTMLElement).style.width === '30px')).toBe(true);
        expect(tauriDragRegions.some((node) => (node as HTMLElement).className.includes('w-1'))).toBe(true);
        expect(container.querySelector('[data-myagents-titlebar-drag-region]')).toBeNull();
        expect(tabbarHost?.className).toContain('flex-1');
    });

    it('does not duplicate global product navigation in the titlebar', async () => {
        mocks.isTauri.mockReturnValue(true);
        await i18n.changeLanguage('en-US');

        renderBar();

        expect(screen.queryByRole('button', { name: 'AI Helper' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Team' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Tasks' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    });
});
