import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionContinuationBanner } from './SessionContinuationBanner';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
function deferred() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(done => { resolve = done; }); return { promise, resolve }; }
function fixture(overrides: Partial<Parameters<typeof SessionContinuationBanner>[0]> = {}) {
  return { sessionId: 'original', turnId: 'unfinished-turn', ready: true, blocked: false,
    onContinue: vi.fn(async () => true), onConsumed: vi.fn(), onUnavailable: vi.fn(), ...overrides };
}
describe('explicit continuation', () => {
  it('does not label a live first turn as unfinished or expose a disabled resume action', () => {
    const props = fixture({ sessionId: 'fresh-session', turnId: 'first-turn', blocked: true });
    const { rerender } = render(<SessionContinuationBanner {...props} />);
    expect(screen.queryByText('shell.continuation.title')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // A successful first turn removes the candidate rather than revealing it.
    rerender(<SessionContinuationBanner {...props} blocked={false} turnId={undefined} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(props.onContinue).not.toHaveBeenCalled();
  });
  it('shows restored unfinished work only after hydration and execution are ready', () => {
    const props = fixture({ ready: false });
    const { rerender } = render(<SessionContinuationBanner {...props} />);
    expect(screen.queryByText('shell.continuation.title')).not.toBeInTheDocument();
    rerender(<SessionContinuationBanner {...props} ready blocked />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<SessionContinuationBanner {...props} ready />);
    expect(screen.getByRole('button')).toBeEnabled();
    expect(props.onContinue).not.toHaveBeenCalled();
  });
  it('does not execute merely because an interrupted conversation was restored', () => {
    const props = fixture(); render(<SessionContinuationBanner {...props} />);
    expect(screen.getByRole('button', { name: 'shell.continuation.continue' })).toBeEnabled();
    expect(props.onContinue).not.toHaveBeenCalled();
  });
  it('continues the exact original turn once while a repeated click is pending', async () => {
    const work = deferred(); const props = fixture({ onContinue: vi.fn(() => work.promise) });
    render(<SessionContinuationBanner {...props} />);
    const button = screen.getByRole('button'); fireEvent.click(button); fireEvent.click(button);
    expect(props.onContinue).toHaveBeenCalledExactlyOnceWith('unfinished-turn');
    expect(button).toBeDisabled();
    await act(async () => { work.resolve(true); });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('keeps a rejected admission retryable', async () => {
    const props = fixture({ onContinue: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) });
    render(<SessionContinuationBanner {...props} />); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(props.onContinue).toHaveBeenCalledTimes(2));
  });
  it('waits for hydration, then consumes one explicit sidebar request', async () => {
    const props = fixture({ ready: false, request: { requestId: 'request1', turnId: 'unfinished-turn' } });
    const { rerender } = render(<SessionContinuationBanner {...props} />);
    expect(props.onConsumed).not.toHaveBeenCalled();
    rerender(<SessionContinuationBanner {...props} ready />);
    await waitFor(() => expect(props.onContinue).toHaveBeenCalledExactlyOnceWith('unfinished-turn'));
    rerender(<SessionContinuationBanner {...props} ready />);
    expect(props.onContinue).toHaveBeenCalledTimes(1); expect(props.onConsumed).toHaveBeenCalledOnce();
  });
  it.each([undefined, 'newer-turn'])('rejects a stale request when current turn is %s', async turnId => {
    const props = fixture({ turnId, request: { requestId: 'stale', turnId: 'old-turn' } });
    render(<SessionContinuationBanner {...props} />);
    await waitFor(() => expect(props.onUnavailable).toHaveBeenCalledOnce());
    expect(props.onContinue).not.toHaveBeenCalled(); expect(props.onConsumed).toHaveBeenCalledOnce();
  });
  it('never defers a blocked request into later automatic execution', () => {
    const props = fixture({ blocked: true, request: { requestId: 'busy', turnId: 'unfinished-turn' } });
    const { rerender } = render(<SessionContinuationBanner {...props} />);
    rerender(<SessionContinuationBanner {...props} blocked={false} />);
    expect(props.onContinue).not.toHaveBeenCalled(); expect(props.onUnavailable).toHaveBeenCalledOnce();
  });
});
