import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

function Consumer() {
    const toast = useToast();
    return <>
        <button onClick={() => toast.info('Information')}>Show information</button>
        <button onClick={() => toast.error('Error')}>Show error</button>
    </>;
}

describe('ToastProvider dismissal lifecycle', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('cancels every pending dismissal when the provider unmounts', () => {
        const view = render(<ToastProvider><Consumer /></ToastProvider>);
        const initialTimers = vi.getTimerCount();
        fireEvent.click(screen.getByRole('button', { name: 'Show information' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show error' }));
        expect(screen.getAllByRole('status')).toHaveLength(2);
        expect(vi.getTimerCount()).toBe(initialTimers + 2);

        view.unmount();

        expect(vi.getTimerCount()).toBe(initialTimers);
        act(() => vi.runAllTimers());
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('cancels a manually closed toast without cancelling other dismissals', () => {
        render(<ToastProvider><Consumer /></ToastProvider>);
        const initialTimers = vi.getTimerCount();
        fireEvent.click(screen.getByRole('button', { name: 'Show information' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show error' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'actions.close' })[0]);

        expect(screen.queryByText('Information')).toBeNull();
        expect(screen.getByRole('status')).toHaveTextContent('Error');
        expect(vi.getTimerCount()).toBe(initialTimers + 1);
        act(() => vi.advanceTimersByTime(5000));
        expect(screen.queryByRole('status')).toBeNull();
        expect(vi.getTimerCount()).toBe(initialTimers);
    });

    it('keeps the default and error reading durations', () => {
        render(<ToastProvider><Consumer /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Show information' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show error' }));

        act(() => vi.advanceTimersByTime(2999));
        expect(screen.getAllByRole('status')).toHaveLength(2);
        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByRole('status')).toHaveTextContent('Error');
        act(() => vi.advanceTimersByTime(1999));
        expect(screen.getByRole('status')).toHaveTextContent('Error');
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByRole('status')).toBeNull();
    });
});
