// Current-page chrome has no legacy restore entry; update controls remain independent.
import { render, screen } from '@testing-library/react';
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
vi.mock('./FeedbackPopover', () => ({ default: () => null }));

import { i18n } from '@/i18n';
import CustomTitleBar from './CustomTitleBar';

function renderBar(over: Partial<React.ComponentProps<typeof CustomTitleBar>> = {}) {
    const result = render(
        <CustomTitleBar
            {...over}
        >
            <div data-testid="tabbar" />
        </CustomTitleBar>,
    );
    return result;
}

describe('CustomTitleBar — 恢复标签页 pill (Issue #309)', () => {
    beforeEach(async () => {
        mocks.isTauri.mockReturnValue(false);
        await i18n.changeLanguage('zh-CN');
    });

    it('has no restore or dismiss entry while keeping current-page content', () => {
        renderBar();
        expect(screen.queryByText('恢复上次标签页')).toBeNull();
        expect(screen.queryByTitle('忽略')).toBeNull();
        expect(screen.getByTestId('tabbar')).toBeTruthy();
    });

    it('shares the global sidebar surface without a bottom divider', () => {
        const { container } = renderBar();
        const titlebar = container.querySelector('.custom-titlebar');

        expect(titlebar).toHaveClass('bg-[var(--global-sidebar-bg)]', 'pl-2');
        expect(titlebar).not.toHaveClass('bg-[var(--paper)]', 'border-b', 'border-[var(--line)]');
        expect(titlebar).not.toHaveClass('bg-gradient-to-b', 'from-[var(--paper)]', 'to-[var(--paper-inset)]/30');
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
