import { describe, expect, it } from 'vitest';
import type { SessionMetadata } from '@/api/sessionClient';
import type { Task } from '../../../shared/types/task';
import type { ActivitySnapshot } from '../project-board/projection';
import { projectWorkSessions, projectSpaceWorkRows } from './projectSpaceWork';
const at = '2026-11-07T00:00:00Z';
const now = Date.parse(at);
function session(id: string, projectId = 'a'): SessionMetadata {
  return { id, title: id, agentDir: '/shared-bot', createdAt: at, lastActiveAt: at,
    projectSpace: { schemaVersion: 1, projectId, projectName: projectId, projectRevision: 1,
      botId: 'same-bot', botName: 'Mino', workspacePath: '/shared-bot', capturedAt: at,
      description: '', instructions: '', materials: [], resources: [] } };
}
function task(id: string, sessionIds: string[], patch: Partial<Task> = {}): Task {
  return { id, name: id, sessionIds, executor: 'agent', workspaceId: 'bot-workspace', workspacePath: '/shared-bot', executionMode: 'once', status: 'todo', tags: [], createdAt: now, updatedAt: now, statusHistory: [], dispatchOrigin: 'direct', ...patch };
}
const rows = (sessions: SessionMetadata[], tasks: Task[] = [], activity: [string, ActivitySnapshot][] = []) => projectSpaceWorkRows(sessions, tasks, new Map(activity), now);
describe('logical project work projection', () => {
  it('uses frozen project and workspace identity, never same Bot membership', () => {
    const a = session('a');
    expect(projectWorkSessions('a', [a, session('b', 'b'), { ...session('legacy'), projectSpace: undefined }, { ...session('wrong'), agentDir: '/other' }])).toEqual([a]);
  });
  it('does not expose mixed-project, incomplete, mismatched-workspace or deleted Tasks', () => {
    const values = rows([session('a')], [task('own', ['a']), task('mixed', ['a', 'b']), task('missing', ['missing']), task('path', ['a'], { workspacePath: '/other' }), task('deleted', ['a'], { deleted: true })]);
    expect(values.map(row => row.id)).toEqual(['task:own']);
  });
  it('never turns idle into completion and treats stale or failed observations as unknown', () => {
    const values = rows([session('idle'), session('stale'), session('failed')], [], [
      ['idle', { state: 'idle', checkedAt: now }],
      ['stale', { state: 'running', checkedAt: now - 90_000 }],
      ['failed', { state: 'idle', checkedAt: now, error: 'unavailable' }],
    ]);
    expect(values.find(row => row.id === 'session:idle')?.status).toBe('idle');
    expect(values.filter(row => row.status === 'completed')).toHaveLength(0);
    expect(values.filter(row => row.status === 'unknown')).toHaveLength(2);
  });
  it('requires an explicit fresh completed Goal or persisted completed Task for results', () => {
    const values = rows([session('goal'), session('task'), session('stale')], [task('done', ['task'], { status: 'done' })], [
      ['goal', { state: 'idle', checkedAt: now, goal: { checkedAt: now, value: { status: 'complete', isExecuting: false } } }],
      ['stale', { state: 'idle', checkedAt: now, goal: { checkedAt: now - 90_000, value: { status: 'complete', isExecuting: false } } }],
    ]);
    expect(values.filter(row => row.status === 'completed').map(row => row.id)).toEqual(['task:done', 'session:goal']);
    expect(values.find(row => row.id === 'session:stale')?.status).toBe('unknown');
  });
  it('retains new running work in a conversation with an older completed Task', () => {
    const values = rows([session('again')], [task('old', ['again'], { status: 'done' })], [['again', { state: 'running', checkedAt: now }]]);
    expect(values.map(row => [row.id, row.status])).toEqual([['session:again', 'running'], ['task:old', 'completed']]);
  });
  it('retains archived completed Tasks but does not infer completion from archived Sessions', () => {
    const completed = { ...session('completed'), archived: true };
    const merelyArchived = { ...session('history'), archived: true };
    expect(rows([completed, merelyArchived], [task('saved', ['completed'], { status: 'archived' })])
      .map(row => [row.id, row.status])).toEqual([['task:saved', 'completed']]);
  });
  it('keeps stopped original conversation work visible for follow-up', () => {
    const value = session('paused');
    value.continuation = { status: 'stopped', rootUserMessageId: 'message', turnId: 'turn' };
    expect(rows([value], [], [['paused', { state: 'idle', checkedAt: now }]])[0].status).toBe('attention');
  });
  it('does not present a scheduled detector check as executing work', () => {
    expect(rows([session('timer')], [task('scheduled', ['timer'], { status: 'running', executionMode: 'scheduled', executionState: 'checking' })])[0].status).toBe('todo');
    expect(rows([session('timer')], [task('live', ['timer'], { status: 'running', executionMode: 'scheduled', executionState: 'running' })])[0].status).toBe('running');
  });
});
