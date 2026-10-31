import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseSessionReply, requestNative, type Snapshot, type Target } from './native';
import { botKey, botSessionKey, readBotDirectory, recentBotSessions, type BotDirectoryPage, type BotSession } from './botDirectory';
import type { RecentSessionItem } from './sessionPresentation';

/** Status projection over the existing account-fenced, reconnecting recent-session reader. */
export function useBotDirectory(recent: readonly RecentSessionItem[], principal: string | null, active: boolean) {
  const [observations, setObservations] = useState<{principal: string | null; entries: Record<string, Pick<BotSession, 'state' | 'terminal' | 'observedAt'>>}>({principal,entries:{}});
  const epoch = useRef(0);
  const observe = useCallback((target: Target, snapshot: Snapshot) => {
    if (target.agentId !== snapshot.agentId) return;
    const observedAt=Date.now();
    setObservations(prior => ({principal,entries:{...(prior.principal === principal ? prior.entries : {}),[botSessionKey({target,sessionId:snapshot.sessionId})]:{state:snapshot.state,terminal:snapshot.terminal,observedAt}}}));
  }, [principal]);
  useEffect(() => {
    const generation = ++epoch.current;
    const valid = () => generation === epoch.current;
    if (!active || !principal) return;
    void readBotDirectory(recent.filter(row=>row.target.online).slice(0,12),async row=>{
      try {
        const reply=parseSessionReply(await requestNative({version:1,kind:'session',targetId:row.target.targetId,request:{kind:'get',agentId:row.target.agentId,sessionId:row.sessionId,limit:1}}));
        if (valid() && reply.kind==='snapshot' && reply.agentId===row.target.agentId && reply.sessionId===row.sessionId) observe(row.target,reply);
      } catch { /* Unread state never implies success. Reopening revalidates the actual owner. */ }
    },valid);
    return ()=>{epoch.current+=1;};
  },[recent,principal,active,observe]);
  const pages = useMemo(() => {
    if (!principal) return [];
    const groups=new Map<string,BotDirectoryPage>();
    for (const row of recent) {
      const key=botKey(row.target); const page=groups.get(key) ?? {target:row.target,sessions:[],error:null,hasMore:false,loadedAt:0};
      const observed=observations.principal === principal ? observations.entries[botSessionKey(row)] : undefined; page.sessions.push({...row,...observed});groups.set(key,page);
    }
    return [...groups.values()];
  },[recent,observations,principal]);
  return {pages,rows:recentBotSessions(pages),loading:false,observe};
}
