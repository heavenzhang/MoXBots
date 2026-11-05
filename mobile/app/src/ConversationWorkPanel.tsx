import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, FileText, ListChecks } from 'lucide-react-native';
import type { Snapshot, Target } from './native';
import { MobileSheet } from './MobileSheet';
import { mobileTheme as c } from './mobileTheme';
import { conversationWorkExcerpts, conversationWorkProgress, type WorkAction } from './conversationWork';

type Props = {
  snapshot: Snapshot | null; target: Target | null;
  awaiting: boolean; reading: boolean; sending: boolean; receipt: 'processing' | 'unknown' | null;
  busy: boolean; canQuery: boolean; canCompose: boolean;
  onAction: (action: WorkAction) => void; onArtifacts: () => void; onLatest: () => void;
};

/** Scoped by the parent view-owner key; the original handlers own all operations. */
export function ConversationWorkPanel(p: Props) {
  const [open, setOpen] = useState(false);
  const progress = conversationWorkProgress({ snapshot: p.snapshot, online: !!p.target?.online, awaiting: p.awaiting, reading: p.reading, sending: p.sending, receipt: p.receipt });
  const excerpts = conversationWorkExcerpts(p.awaiting ? null : p.snapshot);
  const disabled = p.sending || (progress.action === 'query' ? !p.canQuery : progress.action === 'read' ? p.busy || !p.target?.online : progress.action === 'compose' ? !p.canCompose : false);
  const canOpenArtifacts = !!p.snapshot && !p.awaiting;
  const closeThen = (action: () => void) => { setOpen(false); action(); };
  return <>
    <View style={s.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看工作进展：${progress.title}`} accessibilityState={{ expanded: open }} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={s.summary}>
        <View style={s.copy}><View style={s.statusRow}><View style={[s.dot, progress.tone === 'attention' ? s.attentionDot : progress.tone === 'error' ? s.errorDot : progress.tone === 'active' ? s.activeDot : null]}/><Text style={s.status}>{progress.title}</Text></View><Text numberOfLines={2} style={s.detail}>{progress.detail}</Text></View><ChevronRight size={17} color={c.muted}/>
      </Pressable>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={progress.actionLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={() => p.onAction(progress.action)} style={[s.primary, disabled && s.disabled]}><Text style={s.primaryText}>{progress.actionLabel}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="打开本会话成果" accessibilityState={{ disabled: !canOpenArtifacts }} disabled={!canOpenArtifacts} onPress={p.onArtifacts} style={[s.results, !canOpenArtifacts && s.disabled]}><FileText size={16} color={c.primary}/><Text style={s.resultsText}>本会话成果</Text></Pressable>
      </View>
    </View>
    <MobileSheet title="工作进展与下一步" visible={open} onClose={() => setOpen(false)}>
      <Text style={s.workTitle}>{p.snapshot?.title || (p.awaiting ? '正在读取原会话' : '新工作')}</Text>
      <Text style={s.source}>{p.target?.name ?? 'Bot'} · {p.target?.deviceName ?? '当前设备'}</Text>
      <View style={s.progressCard}><Text style={s.sectionTitle}>{progress.title}</Text><Text style={s.body}>{progress.detail}</Text></View>
      <View style={s.section}><Text style={s.sectionTitle}>最近一次要求</Text><Text selectable style={s.body}>{excerpts.request?.content || (excerpts.partial ? '当前加载的记录里没有这条要求，可回对话读取更早记录。' : '发送第一条消息后，会在这里显示你的要求。')}</Text></View>
      <View style={s.section}><Text style={s.sectionTitle}>最近回复摘录</Text><Text selectable style={s.body}>{excerpts.reply ? `${excerpts.reply.content.slice(0, 600)}${excerpts.reply.content.length > 600 || excerpts.reply.truncated ? '\n…更多内容可回对话查看。' : ''}` : excerpts.request ? '这条要求之后还没有可显示的回复。' : '当前没有可显示的回复。'}</Text><Text style={s.hint}>来自原会话已加载的记录，不代替完整记录或任务验收。</Text></View>
      {p.snapshot?.state === 'waiting_user_action' && !p.awaiting && <View style={s.section}><Text style={s.sectionTitle}>当前待处理</Text>{p.snapshot.interactions.map(item => <View key={`${item.generation}:${item.turnId}:${item.requestId}`} style={s.request}><ListChecks size={16} color={c.primary}/><View style={s.copy}><Text style={s.body}>{item.title}</Text>{(!item.actionable || item.generation !== p.snapshot?.generation || item.turnId !== p.snapshot?.turnId) && <Text style={s.hint}>已过期或需在原设备处理</Text>}</View></View>)}<Pressable accessibilityRole="button" accessibilityLabel="定位会话内的当前请求" onPress={() => closeThen(() => p.onAction('requests'))} style={s.returnButton}><Text style={s.resultsText}>回到会话核对请求</Text></Pressable></View>}
      <Text style={s.hint}>成果从本会话单独读取；继续修改会回到原会话，已有草稿保留。</Text>
      <View style={s.sheetActions}><Pressable accessibilityRole="button" accessibilityLabel="回到原会话最新记录" onPress={() => closeThen(p.onLatest)} style={s.returnButton}><Text style={s.resultsText}>回到对话</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="从工作概览查看本会话成果" disabled={!canOpenArtifacts} accessibilityState={{ disabled: !canOpenArtifacts }} onPress={() => closeThen(p.onArtifacts)} style={[s.returnButton, !canOpenArtifacts && s.disabled]}><Text style={s.resultsText}>查看成果</Text></Pressable></View>
    </MobileSheet>
  </>;
}

const s = StyleSheet.create({
  panel: { marginHorizontal: 16, marginBottom: 8, borderRadius: 14, backgroundColor: c.wash, borderWidth: 1, borderColor: '#DDE6DA' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 5, minHeight: 58 },
  copy: { flex: 1, minWidth: 0 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.muted }, attentionDot: { backgroundColor: '#947124' }, errorDot: { backgroundColor: c.red }, activeDot: { backgroundColor: c.online },
  status: { flexShrink: 1, color: c.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' }, detail: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 5 }, primary: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, borderRadius: 9, backgroundColor: c.primary }, primaryText: { color: c.white, fontSize: 12, fontWeight: '600' },
  results: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10, gap: 6 }, resultsText: { color: c.primary, fontSize: 12, lineHeight: 19, fontWeight: '600' }, disabled: { opacity: 0.4 },
  workTitle: { color: c.ink, fontSize: 20, lineHeight: 29, fontWeight: '600' }, source: { color: c.muted, fontSize: 12, lineHeight: 20, marginTop: 4 }, progressCard: { backgroundColor: c.wash, borderRadius: 12, padding: 13, marginTop: 18 },
  section: { paddingVertical: 18, borderBottomWidth: 1, borderColor: c.line }, sectionTitle: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: c.ink, marginBottom: 7 }, body: { color: c.ink, fontSize: 14, lineHeight: 22 }, hint: { color: c.muted, fontSize: 12, lineHeight: 19, marginTop: 10 }, request: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  returnButton: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.canvas }, sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
