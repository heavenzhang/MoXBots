import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBackgroundTaskOutputPath, readRegisteredTaskOutput, BACKGROUND_TASK_OUTPUT_LIMIT } from './background-task-output';
import { completeQueryBackgroundTask, readQueryBackgroundTaskDetail, recordQueryBackgroundTask,
  recordQueryBackgroundTaskOutput, resetLifecycleForTest, setQuerySessionWithAuthority, takeQueryBackgroundTasks } from './lifecycle';

let root: string;
let output: string;
beforeEach(async () => {
  resetLifecycleForTest();
  root = await realpath(await mkdtemp(join(tmpdir(), 'mox-background-output-')));
  await mkdir(join(root, 'sdk-session', 'tasks'), { recursive: true });
  output = join(root, 'sdk-session', 'tasks', 'task.output');
});
afterEach(async () => { resetLifecycleForTest(); await rm(root, { recursive: true, force: true }); });

function owner() {
  return setQuerySessionWithAuthority({} as never, { productSessionId: 'product', expectedSdkSessionId: 'sdk-session' });
}

describe('registered background task output', () => {
  it('captures only runtime output receipt lines', () => {
    expect(extractBackgroundTaskOutputPath([{ type: 'text', text: `Command running\nOutput: ${output}` }])).toBe(output);
    expect(extractBackgroundTaskOutputPath(`Command running in background with ID: task. Output is being written to: ${output}. You will be notified when it completes. To check interim output, use Read on that file path.`)).toBe(output);
    expect(extractBackgroundTaskOutputPath({ stdout: `Output: ${output}` })).toBeUndefined();
    expect(extractBackgroundTaskOutputPath(`echo Output: ${output}`)).toBeUndefined();
  });
  it('distinguishes unavailable, missing, empty and actual sanitized output', async () => {
    expect((await readRegisteredTaskOutput(undefined, 'task', 'sdk-session')).outputState).toBe('unavailable');
    expect((await readRegisteredTaskOutput(output, 'task', 'sdk-session')).outputState).toBe('missing');
    await writeFile(output, '');
    expect(await readRegisteredTaskOutput(output, 'task', 'sdk-session')).toEqual({ output: '', outputState: 'empty', truncated: false, totalBytes: 0 });
    await writeFile(output, '\x1b[31m中文日志\x1b[0m\n\x00ok\t🙂');
    expect((await readRegisteredTaskOutput(output, 'task', 'sdk-session')).output).toBe('中文日志\nok\t🙂');
  });
  it('bounds reads to a UTF-8-safe 64 KiB tail and reports original size', async () => {
    const text = '中'.repeat(BACKGROUND_TASK_OUTPUT_LIMIT);
    await writeFile(output, text);
    const result = await readRegisteredTaskOutput(output, 'task', 'sdk-session');
    expect(result.truncated).toBe(true);
    expect(result.totalBytes).toBe(Buffer.byteLength(text));
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(BACKGROUND_TASK_OUTPUT_LIMIT);
    expect(result.output).not.toContain('\ufffd');
    expect(result.output).toBe('中'.repeat(Math.floor(BACKGROUND_TASK_OUTPUT_LIMIT / 3)));
  });
  it('rejects a different task/session, traversal, symbolic links, directories and hard links', async () => {
    await writeFile(output, 'secret');
    expect((await readRegisteredTaskOutput(output, 'other', 'sdk-session')).outputState).toBe('unavailable');
    expect((await readRegisteredTaskOutput(output, 'task', 'other-session')).outputState).toBe('unavailable');
    expect((await readRegisteredTaskOutput(join(root, 'sdk-session', 'tasks') + '/../tasks/task.output', 'task', 'sdk-session')).outputState).toBe('unavailable');
    await rm(output); await symlink(join(root, 'secret'), output);
    expect((await readRegisteredTaskOutput(output, 'task', 'sdk-session')).outputState).toBe('unavailable');
    await rm(output); await mkdir(output);
    expect((await readRegisteredTaskOutput(output, 'task', 'sdk-session')).outputState).toBe('unavailable');
    await rm(output, { recursive: true }); await writeFile(join(root, 'secret'), 'secret'); await link(join(root, 'secret'), output);
    expect((await readRegisteredTaskOutput(output, 'task', 'sdk-session')).outputState).toBe('unavailable');
  });
  it('rejects a symbolic-link parent even when it names the expected session', async () => {
    await mkdir(join(root, 'real', 'tasks'), { recursive: true });
    await writeFile(join(root, 'real', 'tasks', 'task.output'), 'secret');
    await rm(join(root, 'sdk-session'), { recursive: true });
    await symlink(join(root, 'real'), join(root, 'sdk-session'));
    expect((await readRegisteredTaskOutput(output, 'task', 'sdk-session')).outputState).toBe('unavailable');
  });
});

describe('exact Query background task detail', () => {
  it('uses only registered tool identity, keeps running when file exists and preserves terminal status', async () => {
    const authority = owner();
    recordQueryBackgroundTask(authority.query, 'task', { runId: 'run-1', toolUseId: 'tool', startedAt: 1, agentType: 'local_bash', outputPath: output });
    await writeFile(output, 'work');
    expect(await readQueryBackgroundTaskDetail(authority, 'other-tool')).toEqual({ success: false, errorCode: 'BACKGROUND_TASK_NOT_FOUND' });
    expect(await readQueryBackgroundTaskDetail(authority, 'tool')).toMatchObject({ success: true, task: { status: 'running', output: 'work', taskType: 'local_bash' } });
    completeQueryBackgroundTask(authority.query, 'task', { runId: 'run-1', status: 'failed', summary: 'failed', finishedAt: 10 });
    expect(await readQueryBackgroundTaskDetail(authority, 'tool')).toMatchObject({ success: true, task: { status: 'failed', finishedAt: 10 } });
    await rm(output);
    expect(await readQueryBackgroundTaskDetail(authority, 'tool')).toMatchObject({ success: true, task: { status: 'failed', outputState: 'missing' } });
  });
  it('fences superseded runs, their old output paths and late terminal enrichment', async () => {
    const authority = owner();
    recordQueryBackgroundTask(authority.query, 'task', { runId: 'run-1', toolUseId: 'tool-1', outputPath: output });
    recordQueryBackgroundTask(authority.query, 'task', { runId: 'run-2', toolUseId: 'tool-2' });
    expect(recordQueryBackgroundTaskOutput(authority.query, 'task', 'tool-1', output)).toBe(false);
    completeQueryBackgroundTask(authority.query, 'task', { runId: 'run-1', status: 'completed', outputPath: output });
    expect(await readQueryBackgroundTaskDetail(authority, 'tool-1')).toMatchObject({ success: false });
    expect(await readQueryBackgroundTaskDetail(authority, 'tool-2')).toMatchObject({ success: true, task: { status: 'running', outputState: 'unavailable' } });
  });
  it('rejects superseded run reads after an asynchronous file operation', async () => {
    const authority = owner();
    recordQueryBackgroundTask(authority.query, 'task', { runId: 'run-1', toolUseId: 'tool', outputPath: output });
    await writeFile(output, 'old output');
    const pending = readQueryBackgroundTaskDetail(authority, 'tool');
    recordQueryBackgroundTask(authority.query, 'task', { runId: 'run-2', toolUseId: 'tool' });
    expect(await pending).toEqual({ success: false, errorCode: 'BACKGROUND_TASK_CHANGED' });
  });

  it('rejects stale Query reads and finalizer releases all task details', async () => {
    const authority = owner();
    recordQueryBackgroundTask(authority.query, 'task', { toolUseId: 'tool' });
    const replacement = owner();
    expect(await readQueryBackgroundTaskDetail(authority, 'tool')).toMatchObject({ success: false });
    expect(await readQueryBackgroundTaskDetail(replacement, 'tool')).toMatchObject({ success: false });
    recordQueryBackgroundTask(replacement.query, 'task', { toolUseId: 'tool' });
    takeQueryBackgroundTasks(replacement.query);
    expect(await readQueryBackgroundTaskDetail(replacement, 'tool')).toMatchObject({ success: false });
  });
  it('rejects authority replacement while asynchronous output read is in progress', async () => {
    const authority = owner();
    recordQueryBackgroundTask(authority.query, 'task', { toolUseId: 'tool', outputPath: output });
    await writeFile(output, 'data');
    const pending = readQueryBackgroundTaskDetail(authority, 'tool');
    owner();
    expect(await pending).toEqual({ success: false, errorCode: 'BACKGROUND_TASK_CHANGED' });
  });
});
