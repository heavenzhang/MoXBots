import { describe, expect, it } from 'vitest';
import { isSubagentDispatchFailure } from './subagentDispatchFailure';

describe('native subagent dispatch failure fallback', () => {
  it.each([
    'PreToolUse:Agent hook error: 当前处于 Plan（规划）模式，不能启动子 Agent。',
    '  Error: PreToolUse:Task hook error: delegation is blocked\n',
    'Agent type custom-reviewer not found',
    'Agent type custom-reviewer does not exist',
    'Unknown agent type: custom-reviewer',
  ])('recognizes a native rejection prefix: %s', result => {
    expect(isSubagentDispatchFailure(result)).toBe(true);
  });

  it.each([
    undefined, '', 'Reviewed the hook error and verified the fix.',
    'Regression report: PreToolUse:Agent hook error: previously reproduced.',
    'Error: missing file in the project; review complete.',
    'Agent type custom-reviewer completed the error-handling review.',
  ])('does not infer failure from report prose: %s', result => {
    expect(isSubagentDispatchFailure(result)).toBe(false);
  });
});
