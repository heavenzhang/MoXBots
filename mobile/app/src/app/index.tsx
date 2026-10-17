import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowUp, ArrowUpRight, ChevronRight, FileText, Mic, MoreHorizontal, Plus } from 'lucide-react-native';
import { Account, Interaction, PendingOperation, QaScenario, SessionRequest, Snapshot, SpeechReply, Target, armQaStaleApproval, isFixtureMode, parseSessionReply, qaScenarioOptions, requestNative, selectQaScenario, subscribeSpeechChanges } from '../native';
import { approvalStillCurrent, commitIfViewOwned, draftKey, mutationDisposition, readDraft, updateDraft, viewStillOwned, ViewOwner } from '../operationPolicy';

const C = { ink: '#202522', muted: '#747B76', line: '#E7EAE7', paper: '#FFFFFF', canvas: '#F7F8F6', green: '#26734D', greenWash: '#E9F3EC', red: '#A13E38', amber: '#8B6A29' };
type SessionRow = { sessionId: string; title: string; updatedAt: string; preview: string; runtime: string };
type ReceiptStatus = 'processing' | 'accepted' | 'rejected' | 'unconfirmed' | 'not-found';
type Notice = { tone: 'neutral' | 'error' | 'success'; text: string; code?: string } | null;

const errorMessages: Record<string, string> = {
  MOBILE_RECEIPT_REQUIRED: '设备要求先确认操作状态。请查询状态后再继续；不会自动重发。',
  ON_DEVICE_UNAVAILABLE: '此设备当前没有可用的本地语音识别服务。',
  MICROPHONE_PERMISSION_DENIED: '麦克风权限未开启。可在系统设置中允许后重试。',
  TARGET_UNAVAILABLE: '当前没有可用 Bot，请检查设备连接。',
  ACCOUNT_REPLY_INVALID: '无法读取登录状态，请稍后刷新。',
  SESSION_LIST_REPLY_INVALID: '无法读取会话列表，请稍后重试。',
  SESSION_SNAPSHOT_REPLY_INVALID: '无法读取这条会话，请返回后重试。',
  NATIVE_REPLY_INVALID: '设备返回了无法识别的内容，请稍后重试。',
};
const receiptLabels: Record<ReceiptStatus | PendingOperation['status'], string> = {
  prepared: '待提交', processing: '处理中', accepted: '已接收', rejected: '未接收',
  unconfirmed: '待确认', 'not-found': '无记录', unknown: '待确认',
};

function AppBody() {
  const [account, setAccount] = useState<Account | null>(null);
  const [ownerEpoch, setOwnerEpoch] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<PendingOperation[]>([]);
  const [screen, setScreen] = useState<'login' | 'sessions' | 'chat'>('login');
  const [draft, setDraft] = useState('');
  const [composerInputHeight, setComposerInputHeight] = useState(40);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [receiptStates, setReceiptStates] = useState<Record<string, ReceiptStatus>>({});
  const [qaMenuOpen, setQaMenuOpen] = useState(false);
  const [speech, setSpeech] = useState<SpeechReply>({ kind: 'speech', state: 'idle', text: '', final: false });
  const [speechPanelOpen, setSpeechPanelOpen] = useState(false);
  const [loginStarted, setLoginStarted] = useState(false);
  const blocksMutation = pending.some((item) => item.targetId === target?.targetId && item.sessionId === (snapshot?.sessionId ?? null) && mutationDisposition(item.status) === 'query-only');
  const scrollRef = useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const targetRef = useRef<Target | null>(null);
  const ownerRef = useRef<ViewOwner>({ epoch: 0, screen: 'login', targetId: null, agentId: null, sessionId: null });
  const draftStoreRef = useRef<Record<string, string>>({});
  const activeDraftKeyRef = useRef<string | null>(null);
  const speechDraftKeyRef = useRef<string | null>(null);
  const loadingEpochRef = useRef(0);
  const sendingEpochRef = useRef(0);
  const accountRefreshEpochRef = useRef(0);
  const speechOwnerEpochRef = useRef<number | null>(null);
  const speechStateRef = useRef<SpeechReply['state']>('idle');
  const speechBaseDraftRef = useRef('');
  const appliedSpeechTextRef = useRef('');
  const speechEpochRef = useRef(0);
  const speechActiveRef = useRef(false);
  const composerWidthRef = useRef(0);
  const moveOwner = useCallback((nextScreen: ViewOwner['screen'], nextTarget: Target | null, sessionId: string | null) => {
    const key = draftKey(nextTarget, sessionId);
    const priorOwner = ownerRef.current;
    const priorSnapshot = snapshotRef.current;
    const keepSnapshot = !!sessionId && priorOwner.targetId === nextTarget?.targetId && priorOwner.agentId === nextTarget?.agentId && priorOwner.sessionId === sessionId && priorSnapshot?.sessionId === sessionId;
    targetRef.current = nextTarget;
    snapshotRef.current = keepSnapshot ? priorSnapshot : null;
    activeDraftKeyRef.current = key;
    ownerRef.current = { epoch: ownerRef.current.epoch + 1, screen: nextScreen, targetId: nextTarget?.targetId ?? null, agentId: nextTarget?.agentId ?? null, sessionId };
    setOwnerEpoch(ownerRef.current.epoch);
    loadingEpochRef.current += 1;
    sendingEpochRef.current += 1;
    setLoading(false);
    setSending(false);
    setTarget(nextTarget);
    setScreen(nextScreen);
    setSnapshot(snapshotRef.current);
    setDraft(readDraft(draftStoreRef.current, key));
    setComposerInputHeight(40);
    return ownerRef.current;
  }, []);
  const saveDraftFor = useCallback((key: string | null, value: string) => {
    draftStoreRef.current = updateDraft(draftStoreRef.current, key, value);
    if (key === activeDraftKeyRef.current) {
      setDraft(value);
      // RN Web reports scrollHeight while the textarea still has its previous
      // explicit height. Reset before measuring so deleting lines can shrink it.
      setComposerInputHeight(40);
    }
  }, []);
  const saveDraft = useCallback((value: string) => saveDraftFor(activeDraftKeyRef.current, value), [saveDraftFor]);
  const commitSnapshot = useCallback((value: Snapshot) => { snapshotRef.current = value; setSnapshot(value); }, []);
  const onComposerContentSizeChange = useCallback((event: { nativeEvent: { contentSize: { height: number } } }) => {
    const height = Math.min(106, Math.max(40, Math.ceil(event.nativeEvent.contentSize.height)));
    setComposerInputHeight((current) => current === height ? current : height);
  }, []);
  const onComposerLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    const width = event.nativeEvent.layout.width;
    if (composerWidthRef.current && Math.abs(composerWidthRef.current - width) > 1) setComposerInputHeight(40);
    composerWidthRef.current = width;
  }, []);
  const draftKeyAtRender = activeDraftKeyRef.current;

  const applySpeech = useCallback((reply: SpeechReply) => {
    if (!speechActiveRef.current || speechOwnerEpochRef.current !== ownerRef.current.epoch) return;
    speechStateRef.current = reply.state;
    setSpeech(reply);
    const recognizedText = reply.text.trim();
    if (recognizedText && appliedSpeechTextRef.current !== recognizedText) {
      appliedSpeechTextRef.current = recognizedText;
      const base = speechBaseDraftRef.current.trim();
      saveDraft(base ? `${base}\n${recognizedText}` : recognizedText);
    }
    if (reply.code) {
      speechActiveRef.current = false;
      speechStateRef.current = 'idle';
      setSpeech((prior) => ({ ...prior, state: 'idle' }));
      setNotice({ text: errorMessages[reply.code] ?? '本地语音识别暂时不可用，文字草稿已保留。', tone: 'error', code: reply.code });
      return;
    }
    if (reply.final || reply.state === 'idle') { speechActiveRef.current = false; speechStateRef.current = 'idle'; }
  }, [saveDraft]);

  useEffect(() => subscribeSpeechChanges(applySpeech), [applySpeech]);

  const say = useCallback((text: string, tone: NonNullable<Notice>['tone'] = 'neutral') => {
    if (/^[A-Z][A-Z0-9_]{2,127}$/.test(text)) setNotice({ text: errorMessages[text] ?? '远程操作暂时不可用，请检查连接后重试。', tone, code: text });
    else setNotice({ text, tone });
  }, []);
  const run = useCallback(async (kind: string, action: () => Promise<void>) => {
    const requestOwner = ownerRef.current;
    const requestId = ++loadingEpochRef.current;
    setLoading(true);
    try { await action(); }
    catch (error) { if (viewStillOwned(requestOwner, ownerRef.current)) say(error instanceof Error ? error.message : `NATIVE_${kind.toUpperCase()}_FAILED`, 'error'); }
    finally { if (requestId === loadingEpochRef.current) setLoading(false); }
  }, [say]);

  const loadAccount = useCallback(async () => {
    const refreshEpoch = ++accountRefreshEpochRef.current;
    const reply = await requestNative({ version: 1, kind: 'account.status' });
    if (refreshEpoch !== accountRefreshEpochRef.current) return;
    if (reply.kind !== 'account') throw new Error(reply.kind === 'error' ? reply.code : 'ACCOUNT_REPLY_INVALID');
    setAccount(reply);
    if (reply.state !== 'signed-in') {
      moveOwner('login', null, null);
      setSessions([]);
      return;
    }
    const result = await requestNative({ version: 1, kind: 'targets.list' });
    if (refreshEpoch !== accountRefreshEpochRef.current) return;
    if (result.kind !== 'targets') throw new Error(result.kind === 'error' ? result.code : 'TARGETS_REPLY_INVALID');
    setTargets(result.items);
    const previous = targetRef.current;
    const selectedTarget = result.items.find((item) => item.targetId === previous?.targetId)
      ?? result.items.find((item) => item.agentId === previous?.agentId && item.deviceName === previous.deviceName)
      ?? result.items.find((item) => item.online) ?? result.items[0] ?? null;
    const previousOwner = ownerRef.current;
    const sameLogicalTarget = !!previous && !!selectedTarget && previous.agentId === selectedTarget.agentId && previous.deviceName === selectedTarget.deviceName;
    const nextScreen = previousOwner.screen === 'login' ? 'sessions' : previousOwner.screen;
    const nextSessionId = nextScreen === 'chat' && sameLogicalTarget ? previousOwner.sessionId : null;
    if (previousOwner.screen === 'chat' && !sameLogicalTarget) {
      setNotice({ text: '当前 Bot 已不可用，请从列表重新打开会话。', tone: 'error' });
    }
    const refreshedOwner = moveOwner(nextScreen === 'chat' && !sameLogicalTarget ? 'sessions' : nextScreen, selectedTarget, nextSessionId);
    if (refreshEpoch !== accountRefreshEpochRef.current) return;
    if (selectedTarget?.online && refreshedOwner.screen === 'sessions') {
      const sessionsReply = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: selectedTarget.targetId, request: { kind: 'list', agentId: selectedTarget.agentId, limit: 30 } }));
      if (viewStillOwned(refreshedOwner, ownerRef.current)) {
        if (sessionsReply.kind === 'error') throw new Error(sessionsReply.code);
        if (sessionsReply.kind !== 'list' || sessionsReply.agentId !== refreshedOwner.agentId) throw new Error('SESSION_LIST_REPLY_INVALID');
        setSessions(sessionsReply.items);
      }
    } else if (refreshedOwner.screen === 'sessions') setSessions([]);
    if (selectedTarget?.online && refreshedOwner.screen === 'chat' && refreshedOwner.sessionId) {
      const snapshotReply = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: selectedTarget.targetId, request: { kind: 'get', agentId: selectedTarget.agentId, sessionId: refreshedOwner.sessionId, limit: 30 } }));
      if (viewStillOwned(refreshedOwner, ownerRef.current)) {
        if (snapshotReply.kind === 'error') throw new Error(snapshotReply.code);
        if (snapshotReply.kind !== 'snapshot' || snapshotReply.agentId !== refreshedOwner.agentId || snapshotReply.sessionId !== refreshedOwner.sessionId) throw new Error('SESSION_SNAPSHOT_REPLY_INVALID');
        commitSnapshot(snapshotReply);
      }
    }
    const journal = await requestNative({ version: 1, kind: 'operations.pending' });
    if (refreshEpoch === accountRefreshEpochRef.current && journal.kind === 'operations') setPending(journal.items.filter((item) => item.status !== 'prepared'));
  }, [commitSnapshot, moveOwner]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadAccount().catch((error) => say(error instanceof Error ? error.message : 'ACCOUNT_LOAD_FAILED', 'error')); }, 0);
    return () => clearTimeout(timer);
  }, [loadAccount, say]);
  useEffect(() => {
    if (loginStarted) {
    const timer = setInterval(() => {
      void requestNative({ version: 1, kind: 'account.login.poll' }).then((reply) => {
        if (reply.kind === 'account') {
          setAccount(reply);
          if (reply.state === 'signed-in') { setLoginStarted(false); void loadAccount(); }
        }
      }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
    }
  }, [loadAccount, loginStarted, say]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadAccount().catch((error) => say(error instanceof Error ? error.message : 'ACCOUNT_LOAD_FAILED', 'error'));
    });
    return () => listener.remove();
  }, [loadAccount, say]);

  const loadSessions = useCallback(async (selected = targetRef.current) => {
    if (!selected) return;
    const owner = ownerRef.current;
    if (owner.screen !== 'sessions' || owner.targetId !== selected.targetId || owner.agentId !== selected.agentId) return;
    const result = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: selected.targetId, request: { kind: 'list', agentId: selected.agentId, limit: 30 } }));
    if (!viewStillOwned(owner, ownerRef.current)) return;
    if (result.kind === 'error') throw new Error(result.code);
    if (result.kind !== 'list' || result.agentId !== owner.agentId) throw new Error('SESSION_LIST_REPLY_INVALID');
    commitIfViewOwned(owner, ownerRef.current, result.items, setSessions);
  }, []);

  useEffect(() => {
    if (screen !== 'chat') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      moveOwner('sessions', targetRef.current, null);
      void loadSessions().catch((error) => say(error instanceof Error ? error.message : 'SESSION_LIST_FAILED', 'error'));
      return true;
    });
    return () => subscription.remove();
  }, [screen, loadSessions, moveOwner, say]);

  const openSnapshot = useCallback(async (row: SessionRow, selected = target) => {
    if (!selected) return;
    const owner = moveOwner('chat', selected, row.sessionId);
    setNotice(null);
    let result;
    try { result = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: selected.targetId, request: { kind: 'get', agentId: selected.agentId, sessionId: row.sessionId, limit: 30 } })); }
    catch (error) { if (viewStillOwned(owner, ownerRef.current)) say(error instanceof Error ? error.message : 'SESSION_SNAPSHOT_FAILED', 'error'); return; }
    if (!viewStillOwned(owner, ownerRef.current)) return;
    if (result.kind === 'error') { say(result.code, 'error'); return; }
    if (result.kind !== 'snapshot' || result.agentId !== selected.agentId || result.sessionId !== row.sessionId) { say('SESSION_SNAPSHOT_REPLY_INVALID', 'error'); return; }
    commitIfViewOwned(owner, ownerRef.current, result, commitSnapshot);
  }, [moveOwner, commitSnapshot, say, target]);

  useEffect(() => {
    if (screen !== 'chat' || !snapshot?.sessionId || !target?.targetId) return;
    const interval = setInterval(() => {
      const current = snapshotRef.current;
      const currentTarget = targetRef.current;
      if (!current || !currentTarget) return;
      const owner = ownerRef.current;
      if (owner.screen !== 'chat' || owner.targetId !== currentTarget.targetId || owner.agentId !== current.agentId || owner.sessionId !== current.sessionId) return;
      void requestNative({ version: 1, kind: 'session', targetId: currentTarget.targetId, request: { kind: 'get', agentId: current.agentId, sessionId: current.sessionId, limit: 30 } })
        .then(parseSessionReply).then((result) => { if (result.kind === 'snapshot' && result.agentId === owner.agentId && result.sessionId === owner.sessionId && result.revision !== snapshotRef.current?.revision) commitIfViewOwned(owner, ownerRef.current, result, commitSnapshot); })
        .catch(() => undefined);
    }, 1500);
    return () => clearInterval(interval);
  }, [commitSnapshot, screen, snapshot?.sessionId, target?.targetId]);

  const mutation = async (request: SessionRequest, targetId = target?.targetId) => {
    if (!targetId) throw new Error('TARGET_UNAVAILABLE');
    const mutationOwner = ownerRef.current;
    const sendingId = ++sendingEpochRef.current;
    setSending(true);
    setNotice(null);
    try {
      const result = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId, request }));
      if (result.kind === 'error') throw new Error(result.code);
      if (result.kind !== 'receipt') throw new Error('MUTATION_RECEIPT_INVALID');
      const stillOwner = viewStillOwned(mutationOwner, ownerRef.current);
      setReceiptStates((states) => ({ ...states, [result.operationId]: result.status }));
      if (result.status === 'processing' || result.status === 'unconfirmed' || result.status === 'not-found') setPending((items) => items.some((item) => item.operationId === result.operationId) ? items : [...items, { targetId, agentId: request.agentId, operationId: result.operationId, sessionId: result.sessionId, status: result.status === 'processing' ? 'processing' : 'unknown' }]);
      else setPending((items) => items.filter((item) => item.operationId !== result.operationId));
      if (stillOwner && result.status === 'processing') say('已提交，正在确认接收状态');
      else if (stillOwner && result.status === 'accepted') say('已接收');
      else if (stillOwner && result.status === 'unconfirmed') say('结果尚未确认。请查询状态后再继续；这条消息不会自动重发。', 'error');
      else if (stillOwner && result.status === 'not-found') say('未找到该操作记录，无法判断是否执行。请勿直接重发。', 'error');
      else if (stillOwner) say(result.code ?? '操作未接收', 'error');
      if (stillOwner && result.sessionId && request.kind === 'start') {
        const row = { sessionId: result.sessionId, title: request.text.slice(0, 48), updatedAt: new Date().toISOString(), preview: request.text, runtime: target?.runtime ?? '' };
        saveDraft('');
        await openSnapshot(row);
      } else if (stillOwner && request.kind === 'send' && result.status === 'accepted') saveDraft('');
      if (stillOwner && (request.kind === 'respond' || request.kind === 'stop')) {
        const fresh = await requestNative({ version: 1, kind: 'session', targetId, request: { kind: 'get', agentId: request.agentId, sessionId: request.sessionId, limit: 30 } }).then(parseSessionReply);
        if (viewStillOwned(mutationOwner, ownerRef.current) && fresh.kind === 'snapshot' && fresh.agentId === mutationOwner.agentId && fresh.sessionId === mutationOwner.sessionId) commitSnapshot(fresh);
      }
    } catch (error) { if (viewStillOwned(mutationOwner, ownerRef.current)) say(error instanceof Error ? error.message : 'MUTATION_FAILED', 'error'); }
    finally { if (sendingId === sendingEpochRef.current) setSending(false); }
  };

  const sendDraft = () => {
    const text = draft.trim();
    if (!text || !target || sending || blocksMutation) return;
    const operationId = Crypto.randomUUID();
    if (snapshot) void mutation({ kind: 'send', agentId: snapshot.agentId, sessionId: snapshot.sessionId, operationId, text });
    else void mutation({ kind: 'start', agentId: target.agentId, operationId, text });
  };

  const queryPending = async (item: PendingOperation) => {
    const queryOwner = ownerRef.current;
    const result = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: item.targetId, request: { kind: 'receipt', agentId: item.agentId, operationId: item.operationId } }));
    if (result.kind !== 'receipt') throw new Error(result.kind === 'error' ? result.code : 'RECEIPT_REPLY_INVALID');
    setReceiptStates((states) => ({ ...states, [item.operationId]: result.status }));
    if (result.status === 'accepted' || result.status === 'rejected') setPending((items) => items.filter((entry) => entry.operationId !== item.operationId));
    if (viewStillOwned(queryOwner, ownerRef.current)) say(result.status === 'unconfirmed' || result.status === 'not-found' ? `操作状态：${receiptLabels[result.status]}，没有重发。` : `操作状态：${receiptLabels[result.status]}`, result.status === 'unconfirmed' || result.status === 'not-found' ? 'error' : 'neutral');
  };

  const respond = (item: Interaction, approved: boolean, answers?: Record<string, string>) => {
    if (!snapshot || !target || !item.actionable || snapshot.state !== 'waiting_user_action') return;
    const generation = snapshot.generation;
    const turnId = snapshot.turnId;
    const approvalOwner = ownerRef.current;
    const captured = { sessionId: snapshot.sessionId, generation, turnId, requestId: item.requestId };
    if (!generation || !turnId) { say('审批信息已过期，请刷新会话。', 'error'); return; }
    void (async () => {
      try {
        if (isFixtureMode) await armQaStaleApproval();
        const current = parseSessionReply(await requestNative({ version: 1, kind: 'session', targetId: target.targetId, request: { kind: 'get', agentId: snapshot.agentId, sessionId: captured.sessionId, limit: 30 } }));
        if (!viewStillOwned(approvalOwner, ownerRef.current)) return;
        if (current.kind !== 'snapshot' || current.agentId !== approvalOwner.agentId || current.sessionId !== approvalOwner.sessionId) throw new Error(current.kind === 'error' ? current.code : 'APPROVAL_REFRESH_INVALID');
        commitSnapshot(current);
        if (!approvalStillCurrent(current, { requestId: captured.requestId, generation, turnId })) { say('审批信息已更新，尚未提交。请检查刷新后的请求。', 'error'); return; }
        void mutation({ kind: 'respond', agentId: current.agentId, sessionId: captured.sessionId, operationId: Crypto.randomUUID(), generation, turnId, requestId: captured.requestId, interaction: item.interaction, approved, ...(answers ? { answers } : {}) });
      } catch (error) { if (viewStillOwned(approvalOwner, ownerRef.current)) say(error instanceof Error ? error.message : 'APPROVAL_REFRESH_FAILED', 'error'); }
    })();
  };

  const startLogin = async () => {
    const reply = await requestNative({ version: 1, kind: 'account.login.start' });
    if (reply.kind !== 'login') throw new Error(reply.kind === 'error' ? reply.code : 'LOGIN_REPLY_INVALID');
    await Linking.openURL(reply.authorizationUrl);
    setLoginStarted(true);
    setAccount((prior) => prior ? { ...prior, state: 'authenticating' } : { kind: 'account', state: 'authenticating', displayName: null, principalId: null });
  };

  const startSpeech = async () => {
    setNotice(null);
    setSpeechPanelOpen(true);
    setSpeech({ kind: 'speech', state: 'idle', text: '', final: false });
    speechBaseDraftRef.current = draft;
    appliedSpeechTextRef.current = '';
    speechDraftKeyRef.current = activeDraftKeyRef.current;
    if (isFixtureMode) { say('Web 演示不能调用设备麦克风；请在开发构建中测试语音。'); return; }
    const epoch = ++speechEpochRef.current;
    speechOwnerEpochRef.current = ownerRef.current.epoch;
    const ownerEpoch = speechOwnerEpochRef.current;
    speechActiveRef.current = true;
    speechStateRef.current = 'recording';
    setSpeech((prior) => ({ ...prior, state: 'recording' }));
    try {
      const reply = await requestNative({ version: 1, kind: 'speech.start' });
      if (epoch !== speechEpochRef.current || ownerEpoch !== ownerRef.current.epoch) return;
      if (reply.kind === 'error') { speechActiveRef.current = false; speechStateRef.current = 'idle'; setSpeech((prior) => ({ ...prior, state: 'idle' })); say(reply.code, 'error'); return; }
      if (reply.kind !== 'speech') { speechActiveRef.current = false; speechStateRef.current = 'idle'; setSpeech((prior) => ({ ...prior, state: 'idle' })); say('SPEECH_REPLY_INVALID', 'error'); return; }
      applySpeech(reply);
    } catch (error) { if (epoch === speechEpochRef.current && ownerEpoch === ownerRef.current.epoch) { speechActiveRef.current = false; speechStateRef.current = 'idle'; setSpeech((prior) => ({ ...prior, state: 'idle' })); say(error instanceof Error ? error.message : 'SPEECH_START_FAILED', 'error'); } }
  };

  const stopSpeech = async () => {
    if (isFixtureMode) return;
    const epoch = speechEpochRef.current;
    const ownerEpoch = speechOwnerEpochRef.current;
    speechStateRef.current = 'transcribing';
    setSpeech((prior) => ({ ...prior, state: 'transcribing', final: false }));
    try {
      const reply = await requestNative({ version: 1, kind: 'speech.stop' });
      if (epoch !== speechEpochRef.current || ownerEpoch !== ownerRef.current.epoch) return;
      if (reply.kind === 'error') { speechActiveRef.current = false; speechStateRef.current = 'idle'; setSpeech((prior) => ({ ...prior, state: 'idle' })); say(reply.code, 'error'); return; }
      if (reply.kind !== 'speech') { speechActiveRef.current = false; speechStateRef.current = 'idle'; setSpeech((prior) => ({ ...prior, state: 'idle' })); say('SPEECH_REPLY_INVALID', 'error'); return; }
      applySpeech(reply);
    } catch (error) { if (epoch === speechEpochRef.current && ownerEpoch === ownerRef.current.epoch) say(error instanceof Error ? error.message : 'SPEECH_STOP_FAILED', 'error'); }
  };

  const cancelSpeech = useCallback(async (quiet = false) => {
    const shouldCancel = speechActiveRef.current || speechStateRef.current !== 'idle';
    const canceledOwnerEpoch = speechOwnerEpochRef.current;
    speechEpochRef.current += 1;
    speechActiveRef.current = false;
    speechOwnerEpochRef.current = null;
    speechStateRef.current = 'idle';
    setSpeech({ kind: 'speech', state: 'idle', text: '', final: false });
    setSpeechPanelOpen(false);
    appliedSpeechTextRef.current = '';
    if (shouldCancel && !isFixtureMode) {
      try {
        const reply = await requestNative({ version: 1, kind: 'speech.cancel' });
        if (reply.kind === 'error' && !quiet && ownerRef.current.epoch === canceledOwnerEpoch) say(reply.code, 'error');
      } catch (error) { if (!quiet && ownerRef.current.epoch === canceledOwnerEpoch) say(error instanceof Error ? error.message : 'SPEECH_CANCEL_FAILED', 'error'); }
    }
  }, [say]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && speechActiveRef.current) void cancelSpeech(true);
    });
    return () => subscription.remove();
  }, [cancelSpeech]);

  useEffect(() => {
    if (screen !== 'chat' && speechActiveRef.current) void cancelSpeech(true);
  }, [cancelSpeech, screen]);
  useEffect(() => {
    if (speechActiveRef.current && speechOwnerEpochRef.current !== ownerRef.current.epoch) void cancelSpeech(true);
  }, [cancelSpeech, ownerEpoch]);

  const chooseQaScenario = async (scenario: QaScenario) => {
    moveOwner('login', null, null);
    setSessions([]); setPending([]); setNotice(null);
    setReceiptStates({}); setResultsOpen(false); setMenuOpen(false); setComposerMenuOpen(false); setQaMenuOpen(false);
    try { await selectQaScenario(scenario); await loadAccount(); }
    catch (error) { say(error instanceof Error ? error.message : 'NATIVE_SCENARIO_FAILED', 'error'); }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><StatusBar style="dark"/><KeyboardAvoidingView style={[styles.fill, styles.appFrame]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {isFixtureMode && <View accessibilityRole="alert" style={styles.fixtureBanner}><Text style={styles.fixtureText}>演示夹具 · 合成数据 · 不连接真实设备</Text><Pressable accessibilityRole="button" accessibilityLabel="选择 QA 演示场景" onPress={() => setQaMenuOpen((value) => !value)} style={styles.qaScenarioToggle}><Text style={styles.fixtureText}>场景</Text></Pressable>{qaMenuOpen && <View style={styles.qaScenarioOptions}>{qaScenarioOptions.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => void chooseQaScenario(item.id)} style={styles.qaScenarioOption}><Text style={styles.qaScenarioText}>{item.label}</Text></Pressable>)}</View>}</View>}
    {screen === 'login' && <View style={styles.loginPage}>
      <Topbar left="刷新登录状态" onBack={() => void run('account', loadAccount)} right={{ label: '刷新', onPress: () => void run('account', loadAccount) }}/>
      <View style={styles.loginCard}>
        <View style={styles.logoMark}><Text style={styles.logoMarkText}>M</Text></View>
        <Text style={styles.title}>连接你的 Agent</Text>
        <Text style={styles.subtitle}>通过已授权的设备打开同一会话。账号凭据由本机安全存储。</Text>
        {!!notice && <NoticeView notice={notice}/>}
        {account?.state === 'authenticating' || loginStarted ? <View style={styles.pendingLogin}><ActivityIndicator color={C.green}/><Text style={styles.body}>等待浏览器完成授权…</Text><Text style={styles.caption}>授权后会自动检查登录状态。</Text></View> : <Pressable accessibilityRole="button" onPress={() => void run('login', startLogin)} style={styles.primaryButton}><Text style={styles.primaryText}>使用浏览器登录</Text></Pressable>}
        {loading && <ActivityIndicator style={{ marginTop: 16 }} color={C.green}/>}
        <Text style={styles.caption}>登录状态不可用时，可以重试刷新。</Text>
      </View>
    </View>}

    {screen === 'sessions' && <View style={styles.fill}>
      <Topbar left="刷新会话" onBack={() => void run('sessions', loadSessions)} right={{ label: '刷新', onPress: () => void run('sessions', loadSessions) }}/>
      <View style={styles.targetsBar}>
        <Text style={styles.sectionEyebrow}>BOT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {targets.map((item) => <Pressable key={item.targetId} onPress={() => { if (targetRef.current?.targetId !== item.targetId) { moveOwner('sessions', item, null); setSessions([]); } void run('sessions', () => loadSessions(item)); }} style={[styles.targetChip, target?.targetId === item.targetId && styles.targetChipActive]}><View style={[styles.dot, !item.online && styles.dotOff]}/><Text style={[styles.targetChipText, target?.targetId === item.targetId && styles.targetChipTextActive]} numberOfLines={1}>{item.name}</Text></Pressable>)}
          {targets.length === 0 && <Text style={styles.caption}>尚未发现可用 Bot</Text>}
        </ScrollView>
      </View>
      <View style={styles.listHead}><View><Text style={styles.title}>会话</Text><Text style={styles.subtitle}>{target ? `${target.deviceName} · ${target.online ? '在线' : '离线'}` : '选择一个 Bot'}</Text></View><Pressable accessibilityRole="button" onPress={() => { moveOwner('chat', targetRef.current, null); setNotice(null); }} style={styles.newButton}><Text style={styles.newButtonText}>＋ 新会话</Text></Pressable></View>
      {notice && <NoticeView notice={notice}/>}
      <ScrollView style={styles.fill} contentContainerStyle={styles.sessionList}>
        {pending.length > 0 && <View style={styles.pendingBox}><Text style={styles.pendingTitle}>待确认操作</Text><Text style={styles.caption}>状态未知时只查询，不会自动重发。</Text>{pending.map((item) => { const canQuery = !!item.targetId && targets.some((entry) => entry.targetId === item.targetId && entry.online); return <Pressable key={item.operationId} accessibilityRole="button" accessibilityState={{ disabled: !canQuery }} disabled={!canQuery} onPress={() => void run('receipt', () => queryPending(item))} style={[styles.pendingRow, !canQuery && styles.pendingRowDisabled]}><Text style={styles.pendingText}>查询操作 · {receiptLabels[receiptStates[item.operationId] ?? item.status]}</Text><Text style={[styles.pendingLink, !canQuery && styles.pendingLinkDisabled]}>{canQuery ? '查询状态' : '等待设备'}</Text></Pressable>; })}</View>}
        {!target ? <EmptyState title={account?.state === 'signed-in' ? '暂时无法读取 Bot' : '没有可用 Bot'} detail={account?.state === 'signed-in' ? '请检查网络连接后刷新。' : '登录后会从已授权账号读取可连接设备。'}/> : target.online === false ? <EmptyState title="设备当前离线" detail="Bot 设备离线时无法读取会话。"/> : sessions.length === 0 ? <EmptyState title="暂无会话" detail="创建一个会话，或刷新以重新读取。" action="读取会话" onAction={() => void run('sessions', loadSessions)}/> : sessions.map((item) => <Pressable key={item.sessionId} onPress={() => void run('snapshot', () => openSnapshot(item))} style={styles.sessionRow}><View style={styles.sessionIcon}><ArrowUpRight size={18} color={C.green}/></View><View style={styles.sessionCopy}><Text numberOfLines={1} style={styles.sessionTitle}>{item.title || '新会话'}</Text><Text numberOfLines={2} style={styles.sessionPreview}>{item.preview || item.runtime}</Text></View><ChevronRight size={20} color="#A7AEA9"/></Pressable>)}
      </ScrollView>
    </View>}

    {screen === 'chat' && <View style={styles.fill}>
      <View style={styles.chatToolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回会话列表" onPress={() => { moveOwner('sessions', targetRef.current, null); void run('sessions', loadSessions); }} style={styles.back}><ArrowLeft size={22} color={C.ink}/></Pressable>
        <View style={styles.chatToolbarTitle}><Text numberOfLines={1} style={styles.chatTitle}>{snapshot?.title || '新会话'}</Text><Text numberOfLines={1} style={styles.chatSubtitle}>{target?.name ?? 'Bot'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="查看成果" onPress={() => setResultsOpen((value) => !value)} style={styles.toolbarAction}><FileText size={20} color={C.ink}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="更多会话信息" onPress={() => setMenuOpen((value) => !value)} style={styles.toolbarAction}><MoreHorizontal size={22} color={C.ink}/></Pressable>
      </View>
      {resultsOpen && <View style={styles.smallMenu}><Text style={styles.caption}>{isFixtureMode ? '此演示会话没有附件成果。' : '当前没有可读取的会话成果。'}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭成果面板" onPress={() => setResultsOpen(false)}><Text style={styles.pendingLink}>关闭</Text></Pressable></View>}
      {menuOpen && <View style={styles.smallMenu}><Text style={styles.caption}>设备：{target?.deviceName ?? '未知'} · 运行时：{snapshot?.runtime ?? target?.runtime ?? '未知'}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭会话信息" onPress={() => setMenuOpen(false)}><Text style={styles.pendingLink}>关闭</Text></Pressable></View>}
      {notice && <NoticeView notice={notice}/>}
      <ScrollView ref={scrollRef} style={styles.transcript} contentContainerStyle={styles.transcriptContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {!snapshot && <EmptyState title="新建远程会话" detail="输入第一条消息后，设备将按原 Session 所有者创建会话。"/>}
        {snapshot?.state === 'unavailable' && <EmptyState title="会话暂时不可用" detail="请刷新状态或检查设备连接。" action="重新读取" onAction={() => void run('snapshot', () => openSnapshot({ sessionId: snapshot.sessionId, title: snapshot.title, preview: '', updatedAt: '', runtime: snapshot.runtime }))}/>}
        {snapshot?.messages.map((item) => <View key={item.id} style={[styles.messageRow, item.role === 'user' && styles.userMessageRow]}><View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={[styles.messageText, item.role === 'user' && styles.userText]}>{item.content}</Text>{item.truncated && <Text style={styles.messageMeta}>内容已截断</Text>}{item.tools.map((tool) => <Text key={tool.id} style={styles.toolText}>{tool.status === 'running' ? '运行中' : tool.status === 'error' ? '失败' : '完成'} · {tool.name}{tool.summary ? ` — ${tool.summary}` : ''}</Text>)}</View><Text style={styles.messageTimestamp}>{formatMessageTime(item.timestamp)}</Text></View>)}
        {snapshot?.state === 'running' && <View style={styles.thinking}><ActivityIndicator color={C.green}/><Text style={styles.caption}>正在处理…</Text></View>}
        {snapshot?.state === 'waiting_user_action' && snapshot.interactions.map((item) => <ApprovalCard key={`${item.generation}:${item.turnId}:${item.requestId}`} item={item} onRespond={respond} disabled={sending || blocksMutation}/>) }
      </ScrollView>
      <View style={styles.composerArea}>
        {composerMenuOpen && <View style={styles.composerMenu}><Pressable onPress={() => { setComposerMenuOpen(false); say('附件选择当前不可用。', 'neutral'); }} style={styles.menuItem}><Text style={styles.menuLabel}>添加附件</Text><Text style={styles.menuHint}>当前不可用</Text></Pressable><Pressable onPress={() => { setComposerMenuOpen(false); void startSpeech(); }} style={styles.menuItem}><Text style={styles.menuLabel}>语音输入</Text><Text style={styles.menuHint}>{isFixtureMode ? '仅开发构建' : '使用设备麦克风'}</Text></Pressable><Pressable onPress={() => { setComposerMenuOpen(false); say('下一步建议当前不可用。', 'neutral'); }} style={styles.menuItem}><Text style={styles.menuLabel}>下一步建议</Text><Text style={styles.menuHint}>当前不可用</Text></Pressable></View>}
        {speechPanelOpen && <View style={styles.speechPanel}>
          <View style={styles.speechPanelHead}><Text style={styles.speechPanelTitle}>{speech.state === 'recording' ? '正在聆听' : speech.state === 'transcribing' ? '正在整理识别结果' : speech.final ? '识别草稿' : '语音输入'}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭语音输入" onPress={() => void cancelSpeech()} style={styles.speechClose}><Text style={styles.pendingLink}>关闭</Text></Pressable></View>
          {isFixtureMode && !speech.text ? <Text style={styles.caption}>Web 演示不会生成识别内容；开发构建会使用设备本地语音服务。</Text> : <TextInput accessibilityLabel="语音识别草稿" value={speech.text} editable={speech.state === 'idle'} multiline onChangeText={(value) => { if (speechOwnerEpochRef.current !== ownerRef.current.epoch) return; setSpeech((prior) => ({ ...prior, text: value })); appliedSpeechTextRef.current = value; const base = speechBaseDraftRef.current.trim(); saveDraftFor(speechDraftKeyRef.current, base ? `${base}\n${value}` : value); }} placeholder={speech.state === 'recording' ? '正在聆听…' : '识别到的文字会留在这里，发送前可以编辑。'} placeholderTextColor={C.muted} style={styles.speechTextInput}/>}
          <View style={styles.speechActions}>{speech.state === 'recording' ? <Pressable accessibilityRole="button" accessibilityLabel="停止录音并识别" onPress={() => void stopSpeech()} style={styles.speechStop}><Text style={styles.speechStopText}>完成录音</Text></Pressable> : speech.state === 'transcribing' ? <View style={styles.speechProgress}><ActivityIndicator color={C.green}/><Text style={styles.caption}>等待识别完成</Text></View> : <Text style={styles.caption}>{speech.final ? '已加入消息草稿，可继续编辑。' : '识别文本不会自动发送。'}</Text>}</View>
        </View>}
        <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="更多操作：附件、语音和建议" onPress={() => setComposerMenuOpen((value) => !value)} style={styles.plusButton}><Plus size={21} color={C.ink}/></Pressable>
          <TextInput accessibilityLabel="消息输入框" value={draft} onChangeText={(value) => saveDraftFor(draftKeyAtRender, value)} onLayout={onComposerLayout} onContentSizeChange={onComposerContentSizeChange} rows={1} placeholder="发送消息…" placeholderTextColor="#929893" multiline maxLength={8000} returnKeyType="default" blurOnSubmit={false} style={[styles.input, { height: composerInputHeight }]}/>
          {draft.trim() ? <Pressable accessibilityRole="button" accessibilityLabel={sending ? '正在提交' : '发送消息'} disabled={sending || blocksMutation || !target?.online} onPress={sendDraft} style={[styles.sendButton, (sending || blocksMutation || !target?.online) && styles.sendDisabled]}>{sending ? <ActivityIndicator color="#fff" size="small"/> : <ArrowUp size={21} color="#fff" strokeWidth={2.5}/>}</Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={speech.state === 'recording' ? '停止语音输入' : speech.state === 'transcribing' ? '正在识别语音' : '开始语音输入'} disabled={speech.state === 'transcribing'} onPress={() => speech.state === 'recording' ? void stopSpeech() : speech.state === 'transcribing' ? undefined : void startSpeech()} style={styles.micButton}><Mic size={20} color={speech.state === 'recording' ? C.green : C.muted}/></Pressable>}
        </View>
      </View>
    </View>}
  </KeyboardAvoidingView></SafeAreaView>;
}

function Topbar({ left, onBack, right }: { left: string; onBack: () => void; right?: { label: string; onPress: () => void } }) {
  return <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel={left} onPress={onBack} hitSlop={8} style={styles.back}><ArrowLeft size={22} color={C.ink}/></Pressable><View style={styles.brand}><Text style={styles.brandName}>MOXBOTS</Text><Text style={styles.brandSub}>REMOTE</Text></View>{right ? <Pressable accessibilityRole="button" accessibilityLabel={right.label} onPress={right.onPress} style={styles.headerAction}><Text style={styles.headerActionText}>{right.label}</Text></Pressable> : <View style={styles.headerRight}/>}</View>;
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function NoticeView({ notice }: { notice: NonNullable<Notice> }) {
  const [showCode, setShowCode] = useState(false);
  return <View accessibilityRole="alert" style={[styles.notice, notice.tone === 'error' && styles.noticeError, notice.tone === 'success' && styles.noticeSuccess]}>
    <Text style={styles.noticeText}>{notice.text}</Text>
    {notice.code && <Pressable accessibilityRole="button" accessibilityLabel={showCode ? '隐藏错误详情' : '查看错误详情'} onPress={() => setShowCode((value) => !value)} style={styles.errorDetailsButton}><Text style={styles.pendingLink}>{showCode ? '隐藏详情' : '错误详情'}</Text></Pressable>}
    {showCode && notice.code && <Text selectable style={styles.errorCode}>错误码：{notice.code}</Text>}
  </View>;
}
function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text>{action && <Pressable accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}><Text style={styles.secondaryText}>{action}</Text></Pressable>}</View>; }
function ApprovalCard({ item, onRespond, disabled }: { item: Interaction; onRespond: (item: Interaction, approved: boolean, answers?: Record<string, string>) => void; disabled: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const choose = (key: string, value: string, multiple: boolean) => setAnswers((prior) => {
    const selected = prior[key]?.split('\n').filter(Boolean) ?? [];
    const next = multiple ? selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value] : [value];
    return { ...prior, [key]: next.join('\n') };
  });
  return <View style={styles.approvalCard}><Text style={styles.approvalKicker}>{item.interaction === 'permission' ? '需要授权' : item.interaction === 'plan' ? '等待计划确认' : '需要补充信息'}</Text><Text style={styles.approvalTitle}>{item.title}</Text><Text style={styles.approvalDescription}>{item.description}</Text>{item.questions.map((question) => <View key={question.answerKey} style={styles.questionBlock}><Text style={styles.questionText}>{question.question}</Text>{question.options.length ? <View style={styles.answerOptions}>{question.options.map((option) => { const selected = (answers[question.answerKey]?.split('\n') ?? []).includes(option); return <Pressable key={option} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} disabled={disabled} onPress={() => choose(question.answerKey, option, question.multiSelect)} style={[styles.answerOption, selected && styles.answerOptionSelected]}><Text style={[styles.answerOptionText, selected && styles.answerOptionTextSelected]}>{option}</Text></Pressable>; })}</View> : <TextInput accessibilityLabel={question.question} editable={!disabled} value={answers[question.answerKey] ?? ''} onChangeText={(value) => setAnswers((prior) => ({ ...prior, [question.answerKey]: value }))} placeholder="输入回答" style={styles.answerInput}/>}</View>)}{item.actionable ? <View style={styles.approvalActions}><Pressable accessibilityRole="button" disabled={disabled} onPress={() => onRespond(item, false)} style={styles.denyButton}><Text style={styles.denyText}>{item.interaction === 'permission' ? '拒绝' : '取消'}</Text></Pressable><Pressable accessibilityRole="button" disabled={disabled} onPress={() => onRespond(item, true, item.interaction === 'question' ? answers : undefined)} style={styles.allowButton}><Text style={styles.allowText}>{item.interaction === 'permission' ? '允许一次' : item.interaction === 'plan' ? '确认计划' : '提交回答'}</Text></Pressable></View> : <Text style={styles.caption}>此请求已过期或需在原设备处理。</Text>}</View>;
}

export default function App() { return <SafeAreaProvider><AppBody/></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper }, fill: { flex: 1 }, appFrame: Platform.OS === 'web' ? { width: '100%', maxWidth: 480, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line } : {}, topbar: { height: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }, back: { width: 44, height: 44, justifyContent: 'center' }, backText: { fontSize: 34, lineHeight: 40, color: C.ink, fontWeight: '300' }, brand: { marginLeft: 4, flexDirection: 'row', alignItems: 'baseline', gap: 7 }, brandName: { color: C.ink, fontSize: 14, fontWeight: '800', letterSpacing: 1.1 }, brandSub: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 }, headerRight: { flex: 1 }, headerAction: { marginLeft: 'auto', minWidth: 52, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }, headerActionText: { color: C.green, fontSize: 14, fontWeight: '600' },
  loginPage: { flex: 1, backgroundColor: C.canvas }, loginCard: { marginHorizontal: 24, marginTop: 88, padding: 24, borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, logoMark: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.greenWash }, logoMarkText: { fontSize: 23, color: C.green, fontWeight: '800' }, title: { marginTop: 18, fontSize: 24, letterSpacing: -0.4, fontWeight: '700', color: C.ink }, subtitle: { marginTop: 6, color: C.muted, fontSize: 14, lineHeight: 21 }, primaryButton: { height: 50, marginTop: 24, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' }, pendingLogin: { alignItems: 'center', paddingVertical: 25, gap: 10 }, body: { color: C.ink, fontSize: 15 }, caption: { color: C.muted, fontSize: 12, lineHeight: 18 },
  targetsBar: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }, sectionEyebrow: { color: C.muted, fontWeight: '700', fontSize: 10, letterSpacing: 1.2, marginBottom: 9 }, chips: { gap: 8, paddingRight: 18 }, targetChip: { minHeight: 44, maxWidth: 220, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', borderRadius: 22, borderWidth: 1, borderColor: C.line, gap: 8 }, targetChipActive: { borderColor: C.green, backgroundColor: C.greenWash }, targetChipText: { color: C.muted, fontSize: 13, fontWeight: '600' }, targetChipTextActive: { color: C.green }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green }, dotOff: { backgroundColor: '#B5BBB7' },
  listHead: { paddingHorizontal: 20, paddingTop: 13, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, newButton: { height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.green, justifyContent: 'center' }, newButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, sessionList: { paddingHorizontal: 16, paddingBottom: 30 }, sessionRow: { flexDirection: 'row', alignItems: 'center', minHeight: 78, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line }, sessionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center' }, sessionIconText: { fontSize: 18, color: C.green }, sessionCopy: { marginLeft: 12, flex: 1 }, sessionTitle: { color: C.ink, fontWeight: '600', fontSize: 15 }, sessionPreview: { color: C.muted, fontSize: 12, marginTop: 5 }, chevron: { marginLeft: 8, color: '#A7AEA9', fontSize: 25 },
  empty: { flex: 1, minHeight: 185, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, emptyTitle: { color: C.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' }, emptyDetail: { marginTop: 6, maxWidth: 280, color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }, secondaryButton: { marginTop: 15, paddingHorizontal: 18, height: 42, borderRadius: 11, borderWidth: 1, borderColor: C.line, justifyContent: 'center' }, secondaryText: { color: C.green, fontSize: 13, fontWeight: '600' },
  chatToolbar: { height: 56, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line }, chatToolbarTitle: { flex: 1, paddingLeft: 5, paddingRight: 8 }, chatTitle: { color: C.ink, fontWeight: '700', fontSize: 15 }, chatSubtitle: { marginTop: 1, color: C.muted, fontSize: 11 }, toolbarAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, transcript: { flex: 1 }, transcriptContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, flexGrow: 1 }, messageRow: { width: '100%', marginBottom: 16, alignItems: 'flex-start' }, userMessageRow: { alignItems: 'flex-end' }, messageBubble: { maxWidth: '90%', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16 }, assistantBubble: { backgroundColor: C.canvas, borderTopLeftRadius: 5 }, userBubble: { backgroundColor: C.green, borderTopRightRadius: 5 }, messageText: { fontSize: 15, lineHeight: 22, color: C.ink }, userText: { color: '#fff' }, messageMeta: { marginTop: 8, color: '#DDECE2', fontSize: 11 }, messageTimestamp: { marginTop: 4, marginHorizontal: 5, color: '#969D98', fontSize: 10 }, toolText: { marginTop: 7, color: C.muted, fontSize: 12, lineHeight: 18 }, thinking: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2, marginBottom: 15, marginLeft: 5 },
  composerArea: { paddingHorizontal: 12, paddingTop: 1, paddingBottom: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, backgroundColor: C.paper }, composer: { minHeight: 44, maxHeight: 124, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, borderRadius: 24, paddingHorizontal: 3, paddingVertical: 1 }, plusButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, maxHeight: 106, minHeight: 40, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8, color: C.ink, fontSize: 15, lineHeight: 21 }, micButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green }, sendDisabled: { backgroundColor: '#B7C9BD' },
  notice: { marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: C.canvas }, noticeError: { backgroundColor: '#FBEEEC' }, noticeSuccess: { backgroundColor: C.greenWash }, noticeText: { color: C.ink, fontSize: 12, lineHeight: 17 }, errorDetailsButton: { alignSelf: 'flex-start', marginTop: 5, minHeight: 28, justifyContent: 'center' }, errorCode: { marginTop: 3, color: C.muted, fontSize: 11 }, approvalCard: { marginVertical: 8, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#E9DDBD', backgroundColor: '#FFFCF4' }, approvalKicker: { color: C.amber, fontWeight: '700', fontSize: 11 }, approvalTitle: { marginTop: 6, color: C.ink, fontSize: 15, fontWeight: '700' }, approvalDescription: { marginTop: 5, color: C.muted, fontSize: 13, lineHeight: 19 }, questionText: { marginTop: 10, color: C.ink, fontSize: 13, lineHeight: 20 }, approvalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }, denyButton: { minHeight: 42, paddingHorizontal: 16, justifyContent: 'center' }, denyText: { color: C.red, fontWeight: '600' }, allowButton: { minHeight: 42, paddingHorizontal: 15, justifyContent: 'center', borderRadius: 10, backgroundColor: C.green }, allowText: { color: '#fff', fontWeight: '700' },
  smallMenu: { padding: 12, borderBottomWidth: 1, borderColor: C.line, flexDirection: 'row', justifyContent: 'space-between' }, composerMenu: { marginBottom: 9, padding: 10, backgroundColor: C.canvas, borderRadius: 14 }, speechPanel: { marginBottom: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.canvas }, speechPanelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, speechPanelTitle: { color: C.ink, fontSize: 13, fontWeight: '700' }, speechClose: { minHeight: 32, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }, speechTextInput: { marginTop: 8, minHeight: 50, maxHeight: 110, padding: 9, borderRadius: 9, backgroundColor: C.paper, color: C.ink, fontSize: 14, lineHeight: 20 }, speechActions: { minHeight: 38, justifyContent: 'center', alignItems: 'flex-start', marginTop: 5 }, speechStop: { minHeight: 40, minWidth: 110, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: C.green }, speechStopText: { color: C.paper, fontSize: 13, fontWeight: '700' }, speechProgress: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8 }, menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, menuLabel: { color: C.ink, fontSize: 14 }, menuHint: { color: C.muted, fontSize: 11 }, pendingBox: { marginTop: 8, marginBottom: 12, padding: 13, borderRadius: 12, backgroundColor: C.canvas }, pendingTitle: { color: C.ink, fontWeight: '700', fontSize: 13 }, pendingRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, marginTop: 8 }, pendingText: { color: C.muted, fontSize: 12 }, pendingLink: { color: C.green, fontWeight: '600', fontSize: 12 }, pendingRowDisabled: { opacity: 0.55 }, pendingLinkDisabled: { color: C.muted }, fixtureBanner: { minHeight: 27, backgroundColor: '#9A541C', paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, fixtureText: { color: '#fff', fontSize: 11, fontWeight: '700' }, qaScenarioToggle: { minHeight: 26, paddingHorizontal: 7, justifyContent: 'center', borderRadius: 7, backgroundColor: '#7D4115' }, qaScenarioOptions: { flexBasis: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5, paddingBottom: 7 }, qaScenarioOption: { minHeight: 29, paddingHorizontal: 8, justifyContent: 'center', borderRadius: 8, backgroundColor: '#7D4115' }, qaScenarioText: { color: '#fff', fontSize: 10, fontWeight: '600' }, questionBlock: { marginTop: 10 }, answerOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }, answerOption: { minHeight: 38, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper }, answerOptionSelected: { borderColor: C.green, backgroundColor: C.greenWash }, answerOptionText: { color: C.muted, fontSize: 12 }, answerOptionTextSelected: { color: C.green, fontWeight: '700' }, answerInput: { minHeight: 42, marginTop: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: C.paper, color: C.ink },
});
