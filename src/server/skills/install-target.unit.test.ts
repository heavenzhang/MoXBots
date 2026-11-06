import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSkillInstallTarget } from './install-target';
import { SkillInstallError } from './installer';

let root: string;
let a: string;
let b: string;
let globalCwd: string;
let userSkillsDir: string;
let options: Parameters<typeof resolveSkillInstallTarget>[0];

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-target-')));
  a = join(root, 'bot-a');
  b = join(root, 'bot-b');
  globalCwd = join(root, 'global-cwd');
  userSkillsDir = join(root, 'user-skills');
  for (const path of [a, b, globalCwd]) mkdirSync(path);
  options = {
    scope: 'project', sidecarRole: 'global', currentAgentDir: globalCwd,
    userSkillsDir, validateWorkspace: () => ({ valid: true }),
    isRegisteredWorkspace: path => path === a || path === b,
  };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function expectRejected(agentDir: unknown, statusCode: number, overrides = {}) {
  try {
    resolveSkillInstallTarget({ ...options, ...overrides, agentDir });
    expect.fail('Expected target rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(SkillInstallError);
    expect(error).toMatchObject({ statusCode });
  }
  expect(existsSync(join(globalCwd, '.claude'))).toBe(false);
}

describe('Skill installation workspace authority', () => {
  it('isolates selected Bot A, Bot B and user installs from the Global cwd', () => {
    for (const [agentDir, name] of [[a, 'from-a'], [b, 'from-b']]) {
      const target = resolveSkillInstallTarget({ ...options, agentDir });
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'SKILL.md'), name);
    }
    expect(readFileSync(join(a, '.claude/skills/SKILL.md'), 'utf8')).toBe('from-a');
    expect(readFileSync(join(b, '.claude/skills/SKILL.md'), 'utf8')).toBe('from-b');
    expect(resolveSkillInstallTarget({ ...options, scope: 'user', agentDir: '/ignored' })).toBe(userSkillsDir);
    expect(existsSync(join(globalCwd, '.claude'))).toBe(false);
  });

  it('requires an explicit registered workspace on Global, with no cwd fallback', () => {
    expectRejected(undefined, 409);
    expectRejected(globalCwd, 409);
    expectRejected(join(root, 'missing'), 409);
  });

  it.each(['', ' ', 'relative/workspace', null, 42, {}])('rejects malformed explicit target %j', agentDir => {
    expectRejected(agentDir, 400);
  });

  it('rejects unsafe paths and symlink aliases to an unsafe directory', () => {
    options.validateWorkspace = path => ({ valid: path !== b });
    expectRejected(b, 400);
    const alias = join(root, 'alias');
    symlinkSync(b, alias, 'dir');
    expectRejected(alias, 400);
    const file = join(root, 'file');
    writeFileSync(file, 'not a directory');
    expectRejected(file, 409);
  });

  it('preserves Session implicit installs and refuses cross-workspace overrides', () => {
    options.sidecarRole = 'session';
    options.currentAgentDir = a;
    expect(resolveSkillInstallTarget(options)).toBe(join(a, '.claude', 'skills'));
    expect(resolveSkillInstallTarget({ ...options, agentDir: a })).toBe(join(a, '.claude', 'skills'));
    expectRejected(b, 409);
  });

  it('rejects missing or invalid scope before choosing any write destination', () => {
    for (const scope of [undefined, '', 'all']) {
      expect(() => resolveSkillInstallTarget({ ...options, scope })).toThrow('Invalid skill scope');
    }
  });
});
