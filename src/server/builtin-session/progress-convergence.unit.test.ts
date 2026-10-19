import { describe, expect, it } from 'vitest';
import {
  classifyTool,
  ProgressConvergenceTracker,
} from './progress-convergence';

const EXECUTION_TASK = '请修复薪资导入服务里重复读取但不改代码的问题。';

function readOverlapping(
  tracker: ProgressConvergenceTracker,
  times: number,
  path = '/repo/src/service/ImportService.java',
  turnText?: string,
): Array<string | null> {
  const hints: Array<string | null> = [];
  for (let index = 0; index < times; index += 1) {
    hints.push(tracker.observeTool(
      'Read',
      { file_path: path, offset: 1, limit: 400 },
      { turnText: index === 0 ? turnText : undefined },
    ));
  }
  return hints;
}

describe('progress convergence check', () => {
  it('nudges once when a declared edit stage is followed by overlapping re-reads and no edits', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('代码已全部通读，开始动手改代码。');
    const hints = readOverlapping(tracker, 4, '/repo/src/service/ImportService.java', EXECUTION_TASK);

    expect(hints.slice(0, 3)).toEqual([null, null, null]);
    expect(hints[3]).toContain('客户端进展检查');
    expect(hints[3]).toContain('尚未出现任何编辑或写入调用');
    expect(tracker.snapshot()).toMatchObject({
      editOps: 0,
      hints: 1,
      consecutiveReads: 4,
      overlappingRereads: 3,
      maxFileOverlaps: 3,
    });
  });

  it('does not repeat for the same declaration, but allows a fresh stage declaration', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    expect(readOverlapping(tracker, 4, '/repo/a/Service.java', EXECUTION_TASK).at(-1)).not.toBeNull();
    expect(readOverlapping(tracker, 12, '/repo/a/Service.java').every(hint => hint === null)).toBe(true);

    tracker.observeAssistantText('好，现在开始改代码。');
    expect(readOverlapping(tracker, 4, '/repo/a/Service.java').filter(Boolean)).toHaveLength(1);
    expect(tracker.snapshot().hints).toBe(2);

    for (let stage = 0; stage < 5; stage += 1) {
      tracker.observeAssistantText('开始实现。');
      readOverlapping(tracker, 5, '/repo/a/Service.java');
    }
    expect(tracker.snapshot().hints).toBe(3);
  });

  it('never nudges a read-only research turn', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    const hints = readOverlapping(
      tracker,
      30,
      '/repo/src/service/ImportService.java',
      '只读分析这个模块，不要修改代码。',
    );
    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot().readOnlyTurn).toBe(true);

    const research = new ProgressConvergenceTracker();
    research.observeAssistantText('开始修改。');
    expect(readOverlapping(
      research,
      30,
      '/repo/src/service/ImportService.java',
      '分析这个 bug 的根因并给出评审意见。',
    ).every(hint => hint === null)).toBe(true);
  });

  it('treats sequential chunks of one large file as progress, not repetition', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    const hints: Array<string | null> = [];
    for (let offset = 1; offset <= 8_001; offset += 2_000) {
      hints.push(tracker.observeTool(
        'Read',
        { file_path: '/repo/src/service/HugeService.java', offset, limit: 2_000 },
        { turnText: offset === 1 ? EXECUTION_TASK : undefined },
      ));
    }
    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot().overlappingRereads).toBe(0);

    // A single redundant re-read is still investigation; a second one crosses
    // the repeat boundary and is exactly what the nudge is for.
    expect(tracker.observeTool('Read', { file_path: '/repo/src/service/HugeService.java', offset: 1, limit: 2_000 })).toBeNull();
    expect(tracker.observeTool('Read', { file_path: '/repo/src/service/HugeService.java', offset: 2_001, limit: 2_000 })).toContain('客户端进展检查');
  });

  it('does not nudge immediately after verification commands', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始实现。');
    tracker.observeTool('Bash', { command: 'npm test' }, { turnText: EXECUTION_TASK });
    const hints = readOverlapping(tracker, 3, '/repo/src/service/ImportService.java');
    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot().verifyOps).toBe(1);

    tracker.observeTool('Bash', { command: 'cargo test' });
    expect(readOverlapping(tracker, 3, '/repo/src/service/ImportService.java').every(hint => hint === null)).toBe(true);
  });

  it('stops nudging once any edit or write landed', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    readOverlapping(tracker, 3, '/repo/src/service/ImportService.java', EXECUTION_TASK);
    tracker.observeTool('Edit', { file_path: '/repo/src/service/ImportService.java' });
    const hints = readOverlapping(tracker, 15, '/repo/src/service/ImportService.java');
    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot().editOps).toBe(1);
  });

  it('never nudges while waiting for the user or from a subagent', () => {
    const waiting = new ProgressConvergenceTracker();
    waiting.observeAssistantText('开始修改。');
    waiting.observeTool('AskUserQuestion', { questions: [] }, { turnText: EXECUTION_TASK });
    expect(readOverlapping(waiting, 20, '/repo/src/service/ImportService.java')
      .every(hint => hint === null)).toBe(true);
    expect(waiting.snapshot().waitingForUser).toBe(true);

    const subagent = new ProgressConvergenceTracker();
    subagent.observeAssistantText('开始修改。');
    const hints = readOverlapping(subagent, 20, '/repo/src/service/ImportService.java');
    // Re-run every observation as a background worker: none of them may reach
    // the main turn's ledger.
    const worker = new ProgressConvergenceTracker();
    worker.observeAssistantText('开始修改。');
    for (let index = 0; index < 20; index += 1) {
      expect(worker.observeTool(
        'Read',
        { file_path: '/repo/src/service/ImportService.java', offset: 1, limit: 400 },
        { agentId: 'worker-1', turnText: EXECUTION_TASK },
      )).toBeNull();
    }
    expect(worker.snapshot().toolOps).toBe(0);
    // Sanity: the same calls without agentId do reach the boundary.
    expect(hints.filter(Boolean)).toHaveLength(1);
  });

  it('detects re-reading a range consumed in an earlier stage after a fresh promise', () => {
    // Observed pattern: a stage promise, a context compaction, then the model
    // re-reads the same file chunks it had already consumed and still does not
    // edit. The turn-wide range ledger must survive the new declaration.
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    tracker.observeTool('Read', { file_path: '/repo/a/Service.java', offset: 1, limit: 400 }, { turnText: EXECUTION_TASK });
    tracker.observeAssistantText('上下文已恢复，开始动手改代码。');

    const hints = readOverlapping(tracker, 4, '/repo/a/Service.java');
    expect(hints.filter(Boolean)).toHaveLength(1);
    expect(tracker.snapshot()).toMatchObject({ editOps: 0, hints: 1, declarations: 2 });
  });

  it('counts a self-confessed stalled stage and detects declarations split across chunks', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('先同步一下进展。代码还');
    tracker.observeAssistantText('没开始改。现在开始动');
    tracker.observeAssistantText('手改代码。');
    expect(tracker.snapshot().declarations).toBe(2);
    expect(readOverlapping(tracker, 4, '/repo/src/service/ImportService.java', EXECUTION_TASK)
      .at(-1)).toContain('客户端进展检查');
  });

  it('does not treat a negated English promise as a fresh stage', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    expect(readOverlapping(tracker, 4, '/repo/a/Service.java').filter(Boolean)).toHaveLength(1);
    const declarations = tracker.snapshot().declarations;

    tracker.observeAssistantText('I will not start editing yet.');
    expect(tracker.snapshot().declarations).toBe(declarations);
    expect(readOverlapping(tracker, 10, '/repo/a/Service.java').filter(Boolean)).toHaveLength(0);
  });

  it('stays silent without any declared stage or user execution intent', () => {
    const tracker = new ProgressConvergenceTracker();
    const hints = readOverlapping(tracker, 30, '/repo/src/service/ImportService.java');
    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({ declarations: 0, hints: 0, readOps: 30 });
  });

  it('keeps paths and session identifiers out of the injected text', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.observeAssistantText('开始修改。');
    const hints = readOverlapping(
      tracker,
      5,
      '/private/secret/customer/SalaryRecord.java',
      EXECUTION_TASK,
    );
    const hint = hints.find(value => value !== null) ?? '';
    expect(hint).not.toContain('SalaryRecord');
    expect(hint).not.toContain('/private/secret');
    expect(hint).not.toContain('40ef1dde');
  });

  it('classifies read/write/verify/search commands from their content', () => {
    expect(classifyTool('Bash', { command: "sed -n '1,120p' /repo/src/A.java" })).toBe('read');
    expect(classifyTool('Bash', { command: 'cat /repo/src/A.java 2>/dev/null' })).toBe('read');
    expect(classifyTool('Bash', { command: 'head -n 40 /repo/src/A.java' })).toBe('read');
    expect(classifyTool('Bash', { command: "sed -i 's/a/b/' /repo/src/A.java" })).toBe('edit');
    expect(classifyTool('Bash', { command: 'echo changed > /repo/src/A.java' })).toBe('edit');
    expect(classifyTool('Bash', { command: 'git commit -m "fix"' })).toBe('edit');
    expect(classifyTool('Bash', { command: 'npm test' })).toBe('verify');
    expect(classifyTool('Bash', { command: 'cargo test --all' })).toBe('verify');
    expect(classifyTool('Bash', { command: 'rg "foo" /repo/src' })).toBe('other');
    expect(classifyTool('Bash', { command: 'git status --short' })).toBe('other');
    expect(classifyTool('Read', { file_path: '/repo/src/A.java' })).toBe('read');
    expect(classifyTool('TodoWrite', { todos: [] })).toBe('other');
    expect(classifyTool('mcp__browser__navigate', { url: 'https://example.com' })).toBe('other');
  });
});
