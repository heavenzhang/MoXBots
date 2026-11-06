import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REQUIRED_SYSTEM_SKILLS } from '../../shared/systemSkills';
import type { SkillItem, CommandItem } from '../../shared/skillsTypes';

interface Capabilities { success: boolean; skills: SkillItem[]; commands: CommandItem[] }
const skill = (name: string) => `---\nname: ${name}\ndescription: Isolated scope regression\n---\n\n# ${name}\n`;
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const address = server.address();
  await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
  if (!address || typeof address === 'string') throw new Error('Unable to reserve scope test port');
  return address.port;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = (ms: number) => new Promise<boolean>(done => {
    const timer = setTimeout(() => { child.off('exit', finish); done(false); }, ms);
    const finish = () => { clearTimeout(timer); done(true); };
    child.once('exit', finish);
    if (child.exitCode !== null || child.signalCode !== null) { child.off('exit', finish); finish(); }
  });
  child.kill('SIGTERM');
  if (await exited(3000)) return;
  child.kill('SIGKILL');
  if (!await exited(3000)) throw new Error('Scope test sidecar did not exit');
}

// The Vitest no-egress setup protects the parent process. The real Sidecar is
// a separate process, so preload its own transport guard before importing it.
const CHILD_NO_EGRESS = `
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
function assertLocal(host) {
  if (!host || host === 'localhost' || host === '::1' || host === '[::1]' || /^127(?:\\.\\d{1,3}){3}$/.test(host)) return;
  throw new Error('[bot-care no-egress] blocked non-loopback transport');
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === 'object') assertLocal(first.host || first.hostname);
  else if (typeof first === 'number') assertLocal(typeof args[1] === 'string' ? args[1] : undefined);
  return connect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  assertLocal(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname);
  return originalFetch(input, options);
};
syncBuiltinESMExports();
`;

describe('Bot care HTTP workspace scope (real Global Sidecar, isolated files)', () => {
  let scratch: string;
  let home: string;
  let a: string;
  let b: string;
  let unknown: string;
  let source: string;
  let baseUrl: string;
  let child: ChildProcess | undefined;
  let output = '';

  const post = (path: string, body: Record<string, unknown>) => fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const capabilities = async (workspace: string): Promise<Capabilities> => {
    const response = await fetch(`${baseUrl}/api/project-capabilities?agentDir=${encodeURIComponent(workspace)}`);
    expect(response.ok).toBe(true);
    return response.json() as Promise<Capabilities>;
  };

  beforeAll(async () => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'moxbots-bot-care-scope-')));
    home = join(scratch, 'home');
    a = join(scratch, 'bot-a'); b = join(scratch, 'bot-b'); unknown = join(scratch, 'unregistered');
    source = join(scratch, 'import-source');
    const data = join(home, '.myagents');
    for (const path of [data, a, b, unknown, source, join(scratch, 'tmp')]) mkdirSync(path, { recursive: true });
    for (const [workspace, name] of [[a, 'a-only'], [b, 'b-only']]) {
      const dir = join(workspace, '.claude', 'skills', name);
      mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'SKILL.md'), skill(name));
    }
    for (const name of REQUIRED_SYSTEM_SKILLS) {
      const dir = join(data, 'skills', name);
      mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'SKILL.md'), skill(name));
    }
    writeFileSync(join(source, 'SKILL.md'), skill('scope-import'));
    writeFileSync(join(source, 'reference.md'), 'Imported reference stays in Bot B.\n');
    writeFileSync(join(data, 'config.json'), JSON.stringify({ agents: [
      { id: 'bot-a', name: 'Bot A', path: a }, { id: 'bot-b', name: 'Bot B', path: b },
    ] }));
    writeFileSync(join(data, 'projects.json'), JSON.stringify([
      { id: 'project-a', agentId: 'bot-a', name: 'Bot A workspace', path: a },
      { id: 'project-b', agentId: 'bot-b', name: 'Bot B workspace', path: b },
    ]));
    const guard = join(scratch, 'no-egress.mjs'); writeFileSync(guard, CHILD_NO_EGRESS);
    const port = await reservePort(); baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--import', guard, '--import', 'tsx/esm', resolve('src/server/index.ts'),
      '--agent-dir', a, '--port', String(port), '--no-pre-warm', '--sidecar-role', 'global'], {
      cwd: process.cwd(),
      // Do not inherit model credentials, management endpoints or user proxy settings.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: 'en_US.UTF-8',
        HOME: home, USERPROFILE: home, TMPDIR: join(scratch, 'tmp'), TEMP: join(scratch, 'tmp'), TMP: join(scratch, 'tmp'),
        NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', chunk => { output = (output + chunk.toString()).slice(-1_000_000); });
    child.stderr?.on('data', chunk => { output = (output + chunk.toString()).slice(-1_000_000); });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Scope test sidecar exited:\n${output}`);
      try { if ((await fetch(`${baseUrl}/health/ready`)).ok) return; } catch { /* Not listening yet. */ }
      await delay(50);
    }
    throw new Error(`Scope test sidecar did not become ready:\n${output}`);
  });

  afterAll(async () => {
    try { if (child) await stopChild(child); }
    finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
    expect(output).not.toContain('[bot-care no-egress]');
    expect(output).not.toContain('[startup] initializeAgent done');
  });

  it('uploads to explicit Bot B although the real Global process starts with Bot A', async () => {
    const content = skill('scope-upload');
    const response = await post('/api/skill/upload', { filename: 'scope-upload.md', content: Buffer.from(content).toString('base64'), scope: 'project', agentDir: b });
    expect(response.status, await response.text()).toBe(200);
    expect(readFileSync(join(b, '.claude/skills/scope-upload/SKILL.md'), 'utf8')).toBe(content);
    expect(existsSync(join(a, '.claude/skills/scope-upload'))).toBe(false);
    expect(existsSync(join(home, '.myagents/skills/scope-upload'))).toBe(false);
  });

  it('imports the selected local folder and its reference files only into Bot B', async () => {
    const response = await post('/api/skill/import-folder', { folderPath: source, scope: 'project', agentDir: b });
    expect(response.status, await response.text()).toBe(200);
    expect(readFileSync(join(b, '.claude/skills/scope-import/SKILL.md'), 'utf8')).toBe(skill('scope-import'));
    expect(readFileSync(join(b, '.claude/skills/scope-import/reference.md'), 'utf8')).toBe('Imported reference stays in Bot B.\n');
    expect(existsSync(join(a, '.claude/skills/scope-import'))).toBe(false);
    expect(existsSync(join(home, '.myagents/skills/scope-import'))).toBe(false);
  });

  it('creates a project command only in explicit Bot B', async () => {
    const response = await post('/api/command-item/create', { name: 'scope-command', scope: 'project', agentDir: b });
    expect.soft(response.status, await response.text()).toBe(200);
    expect.soft(existsSync(join(b, '.claude/commands/scope-command.md'))).toBe(true);
    expect.soft(existsSync(join(a, '.claude/commands/scope-command.md'))).toBe(false);
    expect.soft(existsSync(join(home, '.myagents/commands/scope-command.md'))).toBe(false);
  });

  it.each(['missing', 'unregistered'] as const)('rejects %s workspace targets without creating files in A, B or the unknown directory', async target => {
    const destination = target === 'missing' ? {} : { agentDir: unknown };
    const upload = `invalid-upload-${target}`;
    const responses = [
      await post('/api/skill/upload', { filename: `${upload}.md`, content: Buffer.from(skill(upload)).toString('base64'), scope: 'project', ...destination }),
      await post('/api/skill/import-folder', { folderPath: source, scope: 'project', ...destination }),
      await post('/api/command-item/create', { name: `invalid-command-${target}`, scope: 'project', ...destination }),
    ];
    for (const response of responses) expect.soft([400, 409], await response.text()).toContain(response.status);
    for (const workspace of [a, b, unknown]) {
      expect.soft(existsSync(join(workspace, '.claude/skills', upload))).toBe(false);
      expect.soft(existsSync(join(workspace, '.claude/commands', `invalid-command-${target}.md`))).toBe(false);
    }
    for (const workspace of [a, unknown]) expect.soft(existsSync(join(workspace, '.claude/skills/scope-import'))).toBe(false);
  });

  it('persists a Bot B capability override without changing Bot A or global skill state', async () => {
    const before = await capabilities(b);
    const item = before.skills.find(candidate => candidate.folderName === 'b-only');
    expect(item).toMatchObject({ enabled: true, capabilityId: 'project:skill:b-only' });
    const response = await post('/api/project-capability/toggle', { agentDir: b, capabilityId: item!.capabilityId, enabled: false });
    expect(response.status, await response.text()).toBe(200);
    const refreshedB = await capabilities(b);
    const refreshedA = await capabilities(a);
    expect(refreshedB.skills.find(candidate => candidate.folderName === 'b-only')).toMatchObject({ enabled: false });
    expect(refreshedA.skills.find(candidate => candidate.folderName === 'a-only')).toMatchObject({ enabled: true });
    expect(refreshedA.skills.some(candidate => candidate.folderName === 'b-only')).toBe(false);
    const config = JSON.parse(readFileSync(join(home, '.myagents/config.json'), 'utf8')) as {
      agents: Array<{ id: string; capabilitySelection?: { disabled: { skills: string[] } } }>;
    };
    expect(config.agents.find(agent => agent.id === 'bot-b')?.capabilitySelection?.disabled.skills).toContain('project:skill:b-only');
    expect(config.agents.find(agent => agent.id === 'bot-a')?.capabilitySelection?.disabled.skills ?? []).toEqual([]);
    expect(readFileSync(join(a, '.claude/skills/a-only/SKILL.md'), 'utf8')).toBe(skill('a-only'));
    expect(readFileSync(join(b, '.claude/skills/b-only/SKILL.md'), 'utf8')).toBe(skill('b-only'));
  });
});
