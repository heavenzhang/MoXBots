import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ExecutionQuality from './ExecutionQuality';
import type { Message } from '@/types/chat';
import type { StreamRecoveryEvidence } from '../../shared/streamRecovery';

const recovery: StreamRecoveryEvidence = {
  version: 1, interruptions: 2, continuations: 1, protectedActions: 3,
  status: 'completed', startedAt: 1_700_000_000_000, updatedAt: 1_700_000_005_000,
};
function recoveryMessage(evidence: unknown = recovery): Message {
  return { id: 'recovery', role: 'assistant', timestamp: new Date(), content: '完成', streamRecovery: evidence as StreamRecoveryEvidence };
}

describe('execution quality reference', () => {
  it('stays collapsed and distinguishes evidence from unassessed answer quality', () => {
    const message: Message = { id: 'quality', role: 'assistant', timestamp: new Date(), usage: { inputTokens: 100, outputTokens: 40, model: 'fixture-model' }, content: [{ type: 'tool_use', tool: { id: 'test', name: 'Bash', input: {}, parsedInput: { command: 'npm test' }, streamIndex: 0, result: 'failed', resultMeta: { exitCode: 1 } } }] };
    const { container } = render(<ExecutionQuality message={message} />);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByText('0 项成功返回 · 1 项失败')).toBeTruthy();
    expect(screen.getByText('未评估')).toBeTruthy();
    expect(screen.getByText('输入 100 · 输出 40')).toBeTruthy();
    expect(container).not.toHaveTextContent(/评分|重试|tokens\/s/);
  });

  it('opens recovery-only evidence and retains the recovered interruption history', () => {
    const { container } = render(<ExecutionQuality message={recoveryMessage()} />);
    const details = container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details.querySelector('summary')).toHaveTextContent('质量参考 · 已从中断恢复');
    fireEvent.click(details.querySelector('summary')!);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('2 次中断 · 1 次续接')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('已保护的完成动作')).toBeTruthy();
    expect(screen.getByText('3 项')).toBeTruthy();
    expect(screen.getByText('5.0s')).toBeTruthy();
    expect(screen.queryByText('检查结果')).toBeNull();
    expect(details).toHaveTextContent('不保证业务动作仅执行一次');
    fireEvent.click(details.querySelector('summary')!);
    expect(details).not.toHaveAttribute('open');
  });

  it.each(['waiting', 'resuming', 'stopped', 'blocked'] as const)('uses observed %s state without claiming recovery completion', status => {
    const { container } = render(<ExecutionQuality message={recoveryMessage({ ...recovery, status, reason: 'uncertain_action' })} live />);
    const summary = container.querySelector('summary')!;
    expect(summary).not.toHaveTextContent('已从中断恢复');
    expect(summary.textContent?.includes('有待确认项')).toBe(status === 'stopped' || status === 'blocked');
    expect(screen.getByText('动作结果不确定，需确认后继续')).toBeTruthy();
  });

  it.each([
    undefined, null, {}, [], { ...recovery, version: 2 },
    { ...recovery, interruptions: -1 }, { ...recovery, continuations: 1.5 },
    { ...recovery, protectedActions: '3' }, { ...recovery, protectedActions: Number.MAX_SAFE_INTEGER + 1 },
    { ...recovery, status: 'success' }, { ...recovery, reason: 'unexpected' },
    { ...recovery, startedAt: NaN }, { ...recovery, updatedAt: Infinity },
    { ...recovery, updatedAt: recovery.startedAt - 1 },
  ])('does not manufacture recovery observations from absent or malformed metadata: %j', value => {
    const message = recoveryMessage();
    message.streamRecovery = value as StreamRecoveryEvidence;
    const { container } = render(<ExecutionQuality message={message} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps legacy tool evidence when recovery metadata is invalid and never infers it from text', () => {
    const message = recoveryMessage({ ...recovery, version: 0 });
    message.content = [{ type: 'text', text: '恢复成功，续接 10 次' }];
    message.usage = { inputTokens: 1, outputTokens: 2 };
    const { container } = render(<ExecutionQuality message={message} />);
    expect(screen.getByText('输入 1 · 输出 2')).toBeTruthy();
    expect(screen.queryByText('中断与续接')).toBeNull();
    expect(container.querySelector('summary')).toHaveTextContent(/^质量参考$/);
  });

  it('uses the server interval without comparing server dates with the client clock', () => {
    const startedAt = Date.now() + 60_000;
    render(<ExecutionQuality message={recoveryMessage({ ...recovery, startedAt, updatedAt: startedAt + 5_000 })} />);
    expect(screen.getByText('5.0s')).toBeTruthy();
  });

  it('preserves long unbroken values and wrapping constraints for a narrow parent', () => {
    const message = recoveryMessage({ ...recovery, status: 'blocked', reason: 'storage_failed' });
    message.usage = { inputTokens: 1, outputTokens: 2, model: `fixture-${'long-model-name'.repeat(30)}` };
    const { container } = render(<div style={{ width: 240 }}><ExecutionQuality message={message} /></div>);
    expect(screen.getByText(message.usage.model!)).toBeTruthy();
    expect(screen.getByText('恢复记录保存失败')).toBeTruthy();
    expect(container.querySelector('dl')).toHaveClass('grid-cols-[minmax(0,auto)_minmax(0,1fr)]', '[&>dd]:[overflow-wrap:anywhere]');
    // jsdom cannot verify pixel overflow; the primary owns actual narrow-view UI acceptance.
  });
});
