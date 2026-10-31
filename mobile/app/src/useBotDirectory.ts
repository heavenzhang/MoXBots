import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSessionReply, requestNative, type Snapshot, type Target } from './native';
import { applyBotSnapshot, botKey, readBotDirectory, recentBotSessions, type BotDirectoryPage } from './botDirectory';

export function useBotDirectory(targets: readonly Target[], principal: string | null, active: boolean) {
  const [pages, setPages] = useState<BotDirectoryPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const epoch = useRef(0);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const signature = JSON.stringify(targets.map(t => [botKey(t), t.name, t.deviceName, t.online]));
  const previousPrincipal = useRef(principal);
  useEffect(() => {
    const generation = ++epoch.current;
    const valid = () => generation === epoch.current;
    const currentTargets = [...targetsRef.current];
    if (previousPrincipal.current !== principal || !principal) {
      previousPrincipal.current = principal; setPages([]);
    }
    if (!active || !principal) { setLoading(false); return; }
    setPages(prior => prior.filter(page => currentTargets.some(t => botKey(t) === botKey(page.target))).map(page => ({ ...page, target: currentTargets.find(t => botKey(t) === botKey(page.target))! })));
    setLoading(true);
    const commit = (page: BotDirectoryPage) => { if (valid()) setPages(prior => [...prior.filter(item => botKey(item.target) !== botKey(page.target)), page]); };
    const collected: BotDirectoryPage[] = [];
    void readBotDirectory(currentTargets, async target => {
      if (!target.online) return;
      try {
        const reply = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: target.targetId, request: { kind: 'list', agentId: target.agentId, limit: 30 } }));
        if (!valid()) return;
        if (reply.kind !== 'list' || reply.agentId !== target.agentId) throw Error(reply.kind === 'error' ? reply.code : 'SESSION_LIST_REPLY_INVALID');
        const page = { target, sessions: reply.items.map(row => ({ ...row, target })), error: null, hasMore: reply.hasMore, loadedAt: Date.now() };
        collected.push(page); commit(page);
      } catch (error) {
        if (valid()) setPages(prior => {
          const old = prior.find(page => botKey(page.target) === botKey(target));
          return [...prior.filter(page => botKey(page.target) !== botKey(target)), { target, sessions: old?.sessions || [], error: error instanceof Error ? error.message : 'SESSION_LIST_FAILED', hasMore: old?.hasMore || false, loadedAt: old?.loadedAt || 0 }];
        });
      }
    }, valid).then(async () => {
      await readBotDirectory(recentBotSessions(collected).slice(0, 12), async row => {
        try {
          const reply = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: row.target.targetId, request: { kind: 'get', agentId: row.target.agentId, sessionId: row.sessionId, limit: 1 } }));
          if (valid() && reply.kind === 'snapshot' && reply.sessionId === row.sessionId && reply.agentId === row.target.agentId) setPages(prior => prior.map(page => ({ ...page, sessions: applyBotSnapshot(page.sessions, row.target, reply) })));
        } catch { /* Unknown status must not imply idle or completion. */ }
      }, valid);
    }).finally(() => { if (valid()) setLoading(false); });
    return () => { epoch.current += 1; };
  }, [signature, principal, active, refreshToken]);
  const observe = useCallback((target: Target, snapshot: Snapshot) => setPages(prior => prior.map(page => ({ ...page, sessions: applyBotSnapshot(page.sessions, target, snapshot) }))), []);
  return { observe, pages: principal === previousPrincipal.current ? pages : [], loading,
    rows: recentBotSessions(principal === previousPrincipal.current ? pages : []), refresh: useCallback(() => setRefreshToken(value => value + 1), []) };
}
