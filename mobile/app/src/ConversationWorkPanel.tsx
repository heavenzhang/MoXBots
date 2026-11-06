import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, FileText, ListChecks, MessageCircle } from 'lucide-react-native';
import type { Snapshot, Target } from './native';
import { MobileSheet } from './MobileSheet';
import { mobileTheme as c } from './mobileTheme';
import { conversationWorkExcerpts, conversationWorkProgress, currentWorkRequests, type WorkAction } from './conversationWork';

type Props = {
  snapshot: Snapshot | null; target: Target | null;
  awaiting: boolean; reading: boolean; sending: boolean; receipt: 'processing' | 'unknown' | null;
  busy: boolean; canQuery: boolean; canCompose: boolean;
  section: 'conversation' | 'requests'; onConversation: () => void; onRequests: () => void;
  onAction: (action: WorkAction) => void; onArtifacts: () => void; onLatest: () => void;
};

/** Scoped by the parent view-owner key; the original handlers own all operations. */
export function ConversationWorkPanel(p: Props) {
  const [open, setOpen] = useState(false);
  const progress = conversationWorkProgress({ snapshot: p.snapshot, online: !!p.target?.online, awaiting: p.awaiting, reading: p.reading, sending: p.sending, receipt: p.receipt });
  const excerpts = conversationWorkExcerpts(p.awaiting ? null : p.snapshot);
  const disabled = p.sending || (progress.action === 'query' ? !p.canQuery : progress.action === 'read' ? p.busy || !p.target?.online : progress.action === 'compose' ? !p.canCompose : false);
  const canOpenArtifacts = !!p.snapshot && !p.awaiting;
  const requests = currentWorkRequests(p.awaiting ? null : p.snapshot);
  const showInlineDetail = p.awaiting || !!p.receipt || !p.target?.online || progress.tone === 'error' || progress.action === 'read';
  const closeThen = (action: () => void) => { setOpen(false); action(); };
  return <>
    <View style={s.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看工作进展：${progress.title}`} accessibilityState={{ expanded: open }} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={s.summary}>
        <View style={s.copy}><View style={s.statusRow}><View style={[s.dot, progress.tone === 'attention' ? s.attentionDot : progress.tone === 'error' ? s.errorDot : progress.tone === 'active' ? s.activeDot : null]}/><Text style={s.status}>{progress.title}</Text></View>{showInlineDetail && <Text style={s.detail}>{progress.detail}</Text>}</View><ChevronRight size={17} color={c.muted}/>
      </Pressable>
      {(progress.action === 'query' || progress.action === 'read') && <Pressable accessibilityRole="button" accessibilityLabel={progress.actionLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={() => p.onAction(progress.action)} style={[s.recovery, disabled && s.disabled]}><Text style={s.resultsText}>{progress.actionLabel}</Text></Pressable>}
    </View>
    <View style={s.navigation}>
      <Pressable accessibilityRole="tab" accessibilityLabel="对话" accessibilityState={{ selected: p.section === 'conversation' }} onPress={p.onConversation} style={[s.navItem, p.section === 'conversation' && s.navSelected]}><MessageCircle size={18} color={p.section === 'conversation' ? c.primary : c.muted}/><Text style={[s.navText, p.section === 'conversation' && s.navTextSelected]}>对话</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityLabel={`待处理${requests.length ? ` ${requests.length}` : ''}`} accessibilityState={{ selected: p.section === 'requests' }} onPress={p.onRequests} style={[s.navItem, p.section === 'requests' && s.navSelected]}><ListChecks size={18} color={p.section === 'requests' ? c.primary : c.muted}/><Text style={[s.navText, p.section === 'requests' && s.navTextSelected]}>待处理{requests.length ? ` ${requests.length}` : ''}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="打开本会话成果" accessibilityState={{ disabled: !canOpenArtifacts }} disabled={!canOpenArtifacts} onPress={p.onArtifacts} style={[s.navItem, !canOpenArtifacts && s.disabled]}><FileText size={18} color={c.muted}/><Text style={s.navText}>成果</Text></Pressable>
    </View>
    <MobileSheet title="工作进展与下一步" visible={open} onClose={() => setOpen(false)}>
      <Text style={s.workTitle}>{p.snapshot?.title || (p.awaiting ? '正在读取原会话' : '新工作')}</Text>
      <Text style={s.source}>{p.target?.name ?? 'Bot'} · {p.target?.deviceName ?? '当前设备'}</Text>
      <View style={s.progressCard}><Text style={s.sectionTitle}>{progress.title}</Text><Text style={s.body}>{progress.detail}</Text></View>
      <View style={s.section}><Text style={s.sectionTitle}>最近一次要求</Text><Text selectable style={s.body}>{excerpts.request?.content || (excerpts.partial ? '当前加载的记录里没有这条要求，可回对话读取更早记录。' : '发送第一条消息后，会在这里显示你的要求。')}</Text></View>
      <View style={s.section}><Text style={s.sectionTitle}>最近回复摘录</Text><Text selectable style={s.body}>{excerpts.reply ? `${excerpts.reply.content.slice(0, 600)}${excerpts.reply.content.length > 600 || excerpts.reply.truncated ? '\n…更多内容可回对话查看。' : ''}` : excerpts.request ? '这条要求之后还没有可显示的回复。' : '当前没有可显示的回复。'}</Text><Text style={s.hint}>来自原会话已加载的记录，不代替完整记录或任务验收。</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={progress.actionLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={() => closeThen(() => p.onAction(progress.action))} style={[s.primary, disabled && s.disabled]}><Text style={s.primaryText}>{progress.actionLabel}</Text></Pressable>
      <Text style={s.hint}>成果从本会话单独读取；继续修改会回到原会话，已有草稿保留。</Text>
      <View style={s.sheetActions}><Pressable accessibilityRole="button" accessibilityLabel="回到原会话最新记录" onPress={() => closeThen(p.onLatest)} style={s.returnButton}><Text style={s.resultsText}>回到对话</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="从工作概览查看本会话成果" disabled={!canOpenArtifacts} accessibilityState={{ disabled: !canOpenArtifacts }} onPress={() => closeThen(p.onArtifacts)} style={[s.returnButton, !canOpenArtifacts && s.disabled]}><Text style={s.resultsText}>查看成果</Text></Pressable></View>
    </MobileSheet>
  </>;
}

const s = StyleSheet.create({
  navigation: { flexDirection:'row',marginHorizontal:24,marginBottom:0,borderBottomWidth:1,borderColor:c.line },
  navItem: { flex:1,minHeight:52,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderColor:'transparent' },
  navSelected: { borderColor: c.primary }, navText: { fontSize:15,lineHeight:22,color:c.muted }, navTextSelected: { color: c.primary, fontWeight: '600' },
  recovery: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, alignSelf: 'flex-start' },
  panel: { marginHorizontal:24,marginBottom:4 },
  summary: { flexDirection:'row',alignItems:'center',gap:12,paddingVertical:6,minHeight:44 },
  copy: { flex: 1, minWidth: 0 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width:7,height:7,borderRadius:4,backgroundColor:c.muted }, attentionDot: { backgroundColor: '#947124' }, errorDot: { backgroundColor: c.red }, activeDot: { backgroundColor: c.online },
  status: { flexShrink:1,color:c.ink,fontSize:15,lineHeight:22,fontWeight:'600' }, detail: { color:c.muted,fontSize:13,lineHeight:20,marginTop:5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 5 }, primary: { minHeight:52,justifyContent:'center',alignItems:'center',paddingHorizontal:16,borderRadius:14,backgroundColor:c.primary }, primaryText: { color:c.white,fontSize:16,lineHeight:24,fontWeight:'600' },
  results: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10, gap: 6 }, resultsText: { color:c.primary,fontSize:15,lineHeight:22,fontWeight:'600' }, disabled: { opacity: 0.4 },
  workTitle: { color:c.ink,fontSize:24,lineHeight:32,fontWeight:'600' }, source: { color:c.muted,fontSize:13,lineHeight:21,marginTop:8 }, progressCard: { backgroundColor: c.wash, borderRadius: 12, padding: 13, marginTop: 18 },
  section: { paddingVertical: 18, borderBottomWidth: 1, borderColor: c.line }, sectionTitle: { fontSize:17,lineHeight:26,fontWeight:'600',color:c.ink,marginBottom:8 }, body: { color:c.ink,fontSize:16,lineHeight:27 }, hint: { color:c.muted,fontSize:13,lineHeight:21,marginTop:12 }, request: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  returnButton: { minHeight:48,paddingHorizontal:16,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:c.canvas }, sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
