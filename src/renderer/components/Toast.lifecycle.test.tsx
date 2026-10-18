import { StrictMode, useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import { ToastProvider, useToast } from './Toast';

function Controls({ capture }: { capture?: (toast: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  useEffect(() => { capture?.(toast); }, [capture, toast]);
  return <>
    <button onClick={() => toast.info('First notice')}>First</button>
    <button onClick={() => toast.success('Second notice', 5000)}>Second</button>
    <button onClick={() => toast.error('Failed notice')}>Error</button>
  </>;
}

describe('Toast lifecycle ownership', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('cancels automatic dismissal when the provider unmounts', () => {
    const view = render(<ToastProvider><Controls /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(screen.getByText('Failed notice')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the dismissal timer after manual close', () => {
    render(<ToastProvider><Controls /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('First notice')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps each visible notice deadline when another notice is added', () => {
    render(<ToastProvider><Controls /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByText('First notice')).not.toBeInTheDocument();
    expect(screen.getByText('Second notice')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('Second notice')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dismisses correctly under StrictMode and schedules nothing from a released context', () => {
    const capture = vi.fn();
    const view = render(<StrictMode><ToastProvider><Controls capture={capture} /></ToastProvider></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('First notice')).not.toBeInTheDocument();
    const released = capture.mock.lastCall![0] as ReturnType<typeof useToast>;
    view.unmount();
    act(() => { released.error('Late response'); });
    expect(vi.getTimerCount()).toBe(0);
  });
});
