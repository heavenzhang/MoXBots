import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseSessionReply, requestNative, type Snapshot, type Target } from './native';
import { botKey, botSessionKey, nextBotStatusBatch, readBotDirectory, recentBotSessions, type BotDirectoryPage, type BotSession } from './botDirectory';
import type { RecentSessionItem } from './sessionPresentation';

type Observation = Pick<BotSession, 'state' | 'terminal' | 'observedAt' | 'statusReadFailed' | 'title' | 'preview'> & { listUpdatedAt: string };

/** Read-only projection; the original native account and execution owners remain authoritative. */
export function useBotDirectory(recent: readonly RecentSessionItem[], principal: string | null, active: boolean) {
  const [observations, setObservations] = useState<{ principal: string | null; entries: Record<string, Observation> }>({ principal, entries: {} });
  const [reading, setReading] = useState({ principal, busy: false });
  const epoch = useRef(0);
  const flight = useRef<object | null>(null);
  const committed = useRef({ recent, principal, active });
  useLayoutEffect(() => { committed.current = { recent, principal, active }; }, [recent, principal, active]);

  const observe = useCallback((target: Target, snapshot: Snapshot, listUpdatedAt?: string) => {
    if (!principal || committed.current.principal !== principal || target.agentId !== snapshot.agentId) return;
    const key = botSessionKey({ target, sessionId: snapshot.sessionId });
    const row = committed.current.recent.find(item => botSessionKey(item) === key);
    if (!row) return;
    const observedAt = Date.now();
    setObservations(prior => {
      if (committed.current.principal !== principal) return prior;
      const entries = prior.principal === principal ? prior.entries : {};
      if ((entries[key]?.observedAt ?? 0) > observedAt) return prior;
      return { principal, entries: { ...entries, [key]: { state: snapshot.state, terminal: snapshot.terminal, observedAt,
        title: snapshot.title || row.title, preview: snapshot.messages.at(-1)?.content.slice(0, 180) || row.preview,
        listUpdatedAt: listUpdatedAt ?? row.updatedAt, statusReadFailed: false } } };
    });
  }, [principal]);

  const readBatch = useCallback(async (rows: readonly RecentSessionItem[], generation: number) => {
    const current = () => epoch.current === generation && committed.current.active && committed.current.principal === principal;
    if (!principal || !current() || flight.current || rows.length === 0) return;
    const token = {}; flight.current = token; setReading({ principal, busy: true });
    try {
      await readBotDirectory(rows, async row => {
        try {
          const reply = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: row.target.targetId,
            request: { kind: 'get', agentId: row.target.agentId, sessionId: row.sessionId, limit: 1 } }));
          if (!current()) return;
          if (reply.kind !== 'snapshot' || reply.agentId !== row.target.agentId || reply.sessionId !== row.sessionId) throw new Error('SESSION_STATUS_REPLY_INVALID');
          observe(row.target, reply, row.updatedAt);
        } catch {
          if (!current()) return;
          setObservations(prior => {
            if (!current()) return prior;
            const entries = prior.principal === principal ? prior.entries : {};
            const key = botSessionKey(row);
            const previous = entries[key]?.listUpdatedAt === row.updatedAt ? entries[key] : { title: row.title, preview: row.preview, listUpdatedAt: row.updatedAt };
            return { principal, entries: { ...entries, [key]: { ...previous, statusReadFailed: true } } };
          });
        }
      }, current);
    } finally {
      if (flight.current === token) {
        flight.current = null;
        if (current()) setReading({ principal, busy: false });
      }
    }
  }, [observe, principal]);

  useEffect(() => {
    const generation = ++epoch.current;
    flight.current = null;
    // Start the external read after commit; a superseded effect must not reset its successor.
    void Promise.resolve().then(() => {
      if (epoch.current !== generation) return;
      setReading({ principal, busy: false });
      const keys = new Set(recent.map(botSessionKey));
      setObservations(prior => {
        if (epoch.current !== generation) return prior;
        if (prior.principal !== principal) return { principal, entries: {} };
        const kept = Object.entries(prior.entries).filter(([key]) => keys.has(key));
        return kept.length === Object.keys(prior.entries).length ? prior : { principal, entries: Object.fromEntries(kept) };
      });
      if (active && principal) void readBatch(recent.filter(row => row.target.online).slice(0, 12), generation);
    });
    return () => { epoch.current += 1; flight.current = null; };
  }, [recent, principal, active, readBatch]);

  const pages = useMemo(() => {
    if (!principal) return [];
    const groups = new Map<string, BotDirectoryPage>();
    for (const row of recent) {
      const key = botKey(row.target);
      const page = groups.get(key) ?? { target: row.target, sessions: [], error: null, hasMore: false, loadedAt: 0 };
      const cached = observations.principal === principal ? observations.entries[botSessionKey(row)] : undefined;
      // A newly updated list row cannot inherit an old terminal or approval state.
      const observed = cached?.listUpdatedAt === row.updatedAt ? cached : undefined;
      page.sessions.push({ ...row, ...observed });
      if (observed?.statusReadFailed) page.error = 'status-read-failed';
      page.loadedAt = Math.max(page.loadedAt, observed?.observedAt ?? 0);
      groups.set(key, page);
    }
    return [...groups.values()];
  }, [recent, observations, principal]);
  const rows = useMemo(() => recentBotSessions(pages), [pages]);
  const readMore = useCallback((keys?: readonly string[]) => {
    const selected = keys ? new Set(keys) : null;
    void readBatch(nextBotStatusBatch(rows.filter(row => !selected || selected.has(botSessionKey(row)))), epoch.current);
  }, [readBatch, rows]);
  return { pages, rows, loading: active && reading.principal === principal && reading.busy, observe, readMore };
}
