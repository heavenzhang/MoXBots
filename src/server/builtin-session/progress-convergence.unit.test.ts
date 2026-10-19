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

describe('scoped prohibitions keep execution convergence active', () => {
  function runDeclaredStage(turnText: string) {
    const tracker = new ProgressConvergenceTracker();
    tracker.reset(turnText);
    tracker.observeAssistantText('开始修改代码。');
    const hints = readOverlapping(tracker, 4, '/fixture/service.ts');
    return { tracker, hints };
  }

  it('keeps execution when protection only covers production data (reported regression)', () => {
    const { tracker, hints } = runDeclaredStage('修复薪资导入代码，不要修改生产数据。');

    expect(hints[3]).toContain('客户端进展检查');
    expect(tracker.snapshot()).toMatchObject({
      readOnlyTurn: false,
      executionIntent: true,
      hints: 1,
    });
  });

  it('keeps execution for the English object-scoped equivalent', () => {
    const { tracker, hints } = runDeclaredStage('Implement the parser fix, do not modify production data.');

    expect(hints[3]).toContain('客户端进展检查');
    expect(tracker.snapshot()).toMatchObject({
      readOnlyTurn: false,
      executionIntent: true,
      hints: 1,
    });
  });

  it.each([
    ['credentials and account config', '修复登录逻辑，不要改动凭据和账号配置。'],
    ['another module', '修复订单导出，不要修改其他模块的文件。'],
    ['database schema and credentials', 'Fix the importer, but do not change the database schema or credentials.'],
    ['files outside the target directory', 'Fix the parser; do not modify files outside src/parser.'],
  ])('keeps execution with a scoped constraint on %s', (_label, turnText) => {
    const { tracker, hints } = runDeclaredStage(turnText);

    expect(hints[3]).toContain('客户端进展检查');
    expect(tracker.snapshot()).toMatchObject({ readOnlyTurn: false, executionIntent: true });
  });

  it('allows editing one module while another is protected', () => {
    const { tracker, hints } = runDeclaredStage('不修改订单模块，只修改支付模块。');
    expect(hints[3]).toContain('客户端进展检查');
    expect(tracker.snapshot()).toMatchObject({ readOnlyTurn: false, executionIntent: true });
  });

  it('ignores prohibitions that only exist inside quoted text or code blocks', () => {
    const cases = [
      '修复提示文案："请勿修改生产数据" 的显示问题。',
      '实现 "do not modify" 错误提示的本地化。',
      'Refactor the guard that rejects `do not modify` comments.',
      '修复文档示例：\n```\n// do not modify this file\n```\n示例要能通过 lint。',
    ];
    for (const turnText of cases) {
      const { tracker, hints } = runDeclaredStage(turnText);
      expect(hints[3], turnText).toContain('客户端进展检查');
      expect(tracker.snapshot().readOnlyTurn, turnText).toBe(false);
    }
  });

  it('treats a read-only file attribute as an environment fact, not the task type', () => {
    const { tracker, hints } = runDeclaredStage('这个配置文件是只读的，请修复写入逻辑。');
    expect(hints[3]).toContain('客户端进展检查');
    expect(tracker.snapshot().readOnlyTurn).toBe(false);
  });
});

describe('whole-turn read-only intent stays exempt', () => {
  function runDeclaredStage(turnText: string) {
    const tracker = new ProgressConvergenceTracker();
    tracker.reset(turnText);
    tracker.observeAssistantText('开始修改代码。');
    const hints = readOverlapping(tracker, 12, '/fixture/service.ts');
    return { tracker, hints };
  }

  it.each([
    ['unscoped code prohibition', '只读分析代码，不要修改源码。'],
    ['analysis plus plan only', '不要修改代码，只给方案。'],
    ['generic any-file prohibition', '请不要修改任何文件，只做评审。'],
    ['analysis-only request with a data constraint', '仅分析，不修改生产数据。'],
    ['English code prohibition', 'Do not modify code; only investigate the root cause.'],
    ['English plan-only request', 'Just analyze the module and give me a plan; do not modify the code.'],
    ['deferred edit with a fix request in the text', '先不要修改代码，把修复方案发给我。'],
  ])('never nudges for %s', (_label, turnText) => {
    const { tracker, hints } = runDeclaredStage(turnText);

    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({ readOnlyTurn: true, hints: 0, executionIntent: false });
  });

  it('does not let an assistant stage declaration escape the user read-only scope', () => {
    const tracker = new ProgressConvergenceTracker();
    tracker.reset('只读分析这个模块，不要修改代码。');
    tracker.observeAssistantText('开始修改代码。');
    const hints = readOverlapping(tracker, 12, '/repo/src/service/ImportService.java');

    expect(hints.every(hint => hint === null)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({ readOnlyTurn: true, declarations: 1, hints: 0 });
  });
});
