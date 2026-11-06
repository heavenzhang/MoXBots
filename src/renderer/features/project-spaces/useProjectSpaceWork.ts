import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionMetadata } from '@/api/sessionClient';
import { taskList } from '@/api/taskCenter';
import type { Task } from '../../../shared/types/task';
import { readBoardSessionActivity } from '../project-board/activity';
import type { ActivitySnapshot } from '../project-board/projection';
import { projectWorkSessions, projectSpaceWorkRows } from './projectSpaceWork';

const MAX_OBSERVATIONS = 50;
const CONCURRENCY = 4;
interface WorkSnapshot {
  projectId: string;
  tasks: Task[];
  activity: Map<string, ActivitySnapshot>;
  taskError: boolean;
  checkedAt: number;
}

/** Visible project reads through the existing TaskStore and passive Session
 * observation owner. Never starts a Session, model, or task execution. */
export function useProjectSpaceWork(projectId: string, allSessions: readonly SessionMetadata[], isActive: boolean) {
  const sessions = useMemo(() => projectWorkSessions(projectId, allSessions), [projectId, allSessions]);
  const candidates = sessions.filter(session => !session.archived).slice(0, MAX_OBSERVATIONS);
  const scopeKey = JSON.stringify(candidates.map(session => [session.id, session.agentDir, session.lastActiveAt]));
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    if (!isActive || !visible) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (!inFlight.current) setNonce(value => value + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [isActive, visible]);
  useEffect(() => {
    if (!isActive || !visible) { setChecking(false); return; }
    let cancelled = false;
    const selected = JSON.parse(scopeKey) as [string, string, string][];
    const previous = inFlight.current;
    setChecking(true);
    setNow(Date.now());
    const run = (async () => {
      if (previous) await previous;
      if (cancelled) return;
      const activity = new Map<string, ActivitySnapshot>();
      const taskRead = taskList().then(tasks => ({ tasks, taskError: false }), () => ({ tasks: [] as Task[], taskError: true }));
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, async () => {
        while (!cancelled && cursor < selected.length) {
          const [id, path] = selected[cursor++];
          try { activity.set(id, await readBoardSessionActivity(id, path)); }
          catch { activity.set(id, { checkedAt: Date.now(), error: 'unavailable' }); }
        }
      }));
      const result = await taskRead;
      if (cancelled) return;
      const checkedAt = Date.now();
      setSnapshot(old => ({ projectId, ...result,
        tasks: result.taskError && old?.projectId === projectId ? old.tasks : result.tasks,
        activity, checkedAt }));
      setChecking(false);
      setNow(checkedAt);
    })();
    inFlight.current = run;
    const release = () => { if (inFlight.current === run) inFlight.current = null; };
    void run.then(release, release);
    return () => { cancelled = true; };
  }, [projectId, isActive, visible, scopeKey, nonce]);
  const current = snapshot?.projectId === projectId ? snapshot : null;
  return {
    rows: projectSpaceWorkRows(sessions, current?.tasks ?? [], current?.activity ?? new Map(), now),
    checking: isActive && visible && (checking || !current),
    taskError: current?.taskError ?? false,
    failedCount: [...current?.activity.values() ?? []].filter(item => item.error).length,
    unobservedCount: Math.max(0, sessions.filter(session => !session.archived).length - MAX_OBSERVATIONS),
    checkedAt: current?.checkedAt,
    refresh: () => setNonce(value => value + 1),
  };
}
