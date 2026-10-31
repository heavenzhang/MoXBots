import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CircleUserRound, Info, RefreshCw, Search, SquarePen, X } from 'lucide-react-native';
import { accountIdentityLabel } from './accountPolicy';
import type { Account, Target } from './native';
import { MobileSheet } from './MobileSheet';
import { mobileTheme as color } from './mobileTheme';
import { filterSessionRows, recentSessionRows, sessionDateGroup, sessionUpdatedLabel, type RecentSessionItem, type SessionListItem } from './sessionPresentation';

type Props = {
  account: Account | null;
  targets: readonly Target[];
  target: Target | null;
  sessions: readonly SessionListItem[];
  recentSessions?: readonly RecentSessionItem[];
  recentBusy?: boolean;
  recentErrorCount?: number;
  onOpenRecent?: (item: RecentSessionItem) => void;
  onRefreshRecent?: () => void;
  search: string;
  searchOpen: boolean;
  onSearch: (value: string) => void;
  onSearchOpen: (value: boolean) => void;
  busy: boolean;
  unavailableDeviceCount: number;
  onAccount: () => void;
  onRefresh: () => void;
  onSelectTarget: (target: Target) => void;
  onNew: () => void;
  onOpen: (session: SessionListItem) => void;
  notice?: ReactNode;
  pending?: ReactNode;
  empty: ReactNode;
};

/** List presentation only: opening, switching Bots and refresh still use the original owner callbacks. */
export function SessionHomeScreen(props: Props) {
  const { target, sessions, search, searchOpen, busy } = props;
  const [scope, setScope] = useState<'recent' | 'bot'>('recent');
  const [info, setInfo] = useState<{ session: RecentSessionItem; recent: boolean } | null>(null);
  const isRecent = scope === 'recent';
  const listBusy = isRecent ? !!props.recentBusy : busy;
  const rows: RecentSessionItem[] = isRecent
    ? recentSessionRows(props.recentSessions ?? [], search)
    : target ? filterSessionRows(sessions, search).map((session) => ({ ...session, target })) : [];
  const sourceCount = isRecent ? (props.recentSessions?.length ?? 0) : sessions.length;
  const canOpenInfo = !!info && (info.recent ? !!props.onOpenRecent : info.session.target.targetId === target?.targetId
    && info.session.target.identityKey === target.identityKey && info.session.target.agentId === target.agentId);
  const openRow = (row: RecentSessionItem, recent: boolean) => {
    if (recent) props.onOpenRecent?.(row);
    else props.onOpen(row);
  };
  let previousGroup = '';
  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="账号与设置" onPress={props.onAccount} style={styles.iconButton}><CircleUserRound size={23} color={color.ink}/></Pressable>
      <Text accessibilityRole="header" style={styles.heading}>会话</Text>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="搜索会话" accessibilityState={{ expanded: searchOpen || !!search }} onPress={() => props.onSearchOpen(!searchOpen)} style={styles.iconButton}><Search size={21} color={color.ink}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="新建会话" accessibilityHint={!target ? '请先选择 Bot' : !target.online ? '设备离线，可先保留草稿' : undefined} accessibilityState={{ disabled: !target }} disabled={!target} onPress={props.onNew} style={[styles.iconButton, !target && styles.disabled]}><SquarePen size={22} color={color.ink}/></Pressable>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`当前${accountIdentityLabel(props.account)}，账号与设置`} onPress={props.onAccount} style={styles.accountSummary}>
      <Text style={styles.accountCaption}>当前账号</Text>
      <Text numberOfLines={2} style={styles.accountIdentity}>{accountIdentityLabel(props.account)}</Text>
    </Pressable>
    <View accessibilityRole="tablist" style={styles.listScopes}>
      {(['recent', 'bot'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} onPress={() => { setScope(value); setInfo(null); }} style={[styles.listScopeButton, scope === value && styles.scopeSelected]}><Text style={[styles.scopeLabel, scope === value && styles.scopeLabelSelected]}>{value === 'recent' ? '最近会话' : '当前 Bot'}</Text></Pressable>)}
    </View>
    <View style={styles.scope}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopes}>
        {props.targets.map((item) => <Pressable key={item.targetId} accessibilityRole="button" accessibilityLabel={`${item.name}，${item.online ? '在线' : '离线'}`} accessibilityState={{ selected: item.targetId === target?.targetId }} onPress={() => { setInfo(null); setScope('bot'); props.onSelectTarget(item); }} style={[styles.scopeButton, item.targetId === target?.targetId && styles.scopeSelected]}>
          <View style={[styles.dot, !item.online && styles.dotOffline]}/><Text numberOfLines={1} style={[styles.scopeLabel, item.targetId === target?.targetId && styles.scopeLabelSelected]}>{item.name}</Text>
        </Pressable>)}
        {props.targets.length === 0 && <Text style={styles.scopeEmpty}>尚未发现可用 Bot</Text>}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="刷新会话和设备" accessibilityState={{ disabled: listBusy }} disabled={listBusy} onPress={isRecent ? (props.onRefreshRecent ?? props.onRefresh) : props.onRefresh} style={styles.refresh}>{listBusy ? <ActivityIndicator size="small" color={color.muted}/> : <RefreshCw size={17} color={color.muted}/>}</Pressable>
    </View>
    {(searchOpen || !!search) && <View style={styles.searchRow}>
      <Search size={18} color={color.muted}/><TextInput autoFocus accessibilityLabel={isRecent ? "搜索最近会话、Bot 或设备" : "搜索当前 Bot 的会话"} placeholder="搜索会话" placeholderTextColor={color.muted} value={search} onChangeText={props.onSearch} returnKeyType="search" style={styles.searchInput}/>
      <Pressable accessibilityRole="button" accessibilityLabel="清除并关闭搜索" onPress={() => { props.onSearch(''); props.onSearchOpen(false); }} style={styles.searchClear}><X size={17} color={color.muted}/></Pressable>
    </View>}
    {props.unavailableDeviceCount > 0 && <Text accessibilityLiveRegion="polite" style={styles.availability}>另有 {props.unavailableDeviceCount} 台设备目录暂不可用</Text>}
    {isRecent && !!props.recentErrorCount && <Text accessibilityLiveRegion="polite" style={styles.availability}>{props.recentErrorCount} 个 Bot 的会话暂未加载，已加载的会话仍可查看。</Text>}
    {props.notice}
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {props.pending}
      {isRecent && sourceCount === 0 ? <View style={styles.empty}>
        {listBusy && <ActivityIndicator size="small" color={color.muted}/>}
        <Text style={styles.emptyTitle}>{listBusy ? '正在加载最近会话' : '暂无已加载的最近会话'}</Text>
        <Text style={styles.emptyDetail}>{props.recentErrorCount ? '部分 Bot 暂不可用，请刷新重试。' : '会话加载后会按最近更新时间显示在这里。'}</Text>
      </View> : !isRecent && (!target || !target.online || sessions.length === 0) ? props.empty : rows.length === 0 ? <View style={styles.empty}>
        <Search size={25} color={color.muted}/><Text style={styles.emptyTitle}>没有找到相关会话</Text><Text style={styles.emptyDetail}>试试其他关键词，或清除搜索查看全部会话。</Text><Pressable accessibilityRole="button" onPress={() => props.onSearch('')} style={styles.clearSearch}><Text style={styles.link}>清除搜索</Text></Pressable>
      </View> : rows.map((row) => {
        const group = sessionDateGroup(row.updatedAt);
        const showGroup = group !== previousGroup;
        previousGroup = group;
        return <View key={JSON.stringify([row.target.identityKey, row.target.targetId, row.target.agentId, row.sessionId])}>
          {showGroup && <Text accessibilityRole="header" style={styles.group}>{group}</Text>}
          <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel={`打开会话：${row.title || '新会话'}${row.preview ? `，${row.preview}` : ''}`} disabled={isRecent && !props.onOpenRecent} onPress={() => openRow(row, isRecent)} style={({ pressed }) => [styles.rowOpen, pressed && styles.rowPressed]}>
              <View style={styles.rowTitle}><Text numberOfLines={1} style={styles.title}>{row.title || '新会话'}</Text><Text style={styles.time}>{sessionUpdatedLabel(row.updatedAt)}</Text></View>
              {!!row.preview && <Text numberOfLines={2} style={styles.preview}>{row.preview}</Text>}
              <Text numberOfLines={1} style={styles.context}>{row.target.name} · {row.target.deviceName}{!row.target.online ? ' · 暂不可用' : ''}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`会话信息：${row.title || '新会话'}`} onPress={() => setInfo({ session: row, recent: isRecent })} style={styles.rowMenu}><Info size={17} color={color.muted}/></Pressable>
          </View>
        </View>;
      })}
    </ScrollView>
    <MobileSheet title="会话信息" visible={!!info} onClose={() => setInfo(null)}>
      <Text style={styles.infoTitle}>{info?.session.title || '新会话'}</Text>
      <InfoRow label="Bot" value={info?.session.target.name}/><InfoRow label="执行设备" value={info?.session.target.deviceName}/><InfoRow label="运行时" value={info?.session.runtime}/>
      <InfoRow label="会话标识" value={info?.session.sessionId}/>
      <Text style={styles.infoHint}>此会话始终在原 Bot 和设备上继续。切换列表中的 Bot 不会改变它的执行位置。</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="继续此会话" disabled={!canOpenInfo} onPress={() => { if (info && canOpenInfo) { openRow(info.session, info.recent); setInfo(null); } }} style={[styles.continueButton, !canOpenInfo && styles.disabled]}><Text style={styles.continueText}>继续此会话</Text></Pressable>
    </MobileSheet>
  </View>;
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value || '未提供'}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, backgroundColor: color.white },
  header: { height: 54, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  heading: { flex: 1, fontSize: 20, fontWeight: '600', letterSpacing: -0.4, color: color.ink },
  headerActions: { flexDirection: 'row' },
  accountSummary: { marginHorizontal: 20, marginBottom: 8, paddingVertical: 8, minHeight: 44 },
  accountCaption: { fontSize: 11, color: color.muted },
  accountIdentity: { fontSize: 13, lineHeight: 18, color: color.ink, marginTop: 3 },
  listScopes: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 6 },
  listScopeButton: { minHeight: 40, paddingHorizontal: 15, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scope: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 7, paddingBottom: 6 },
  scopes: { gap: 5, alignItems: 'center', paddingRight: 8 },
  scopeButton: { minHeight: 36, maxWidth: 205, paddingHorizontal: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 7 },
  scopeSelected: { backgroundColor: color.wash },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.online },
  dotOffline: { backgroundColor: '#B0B0B6' },
  scopeLabel: { fontSize: 14, color: color.muted, flexShrink: 1 },
  scopeLabelSelected: { color: color.ink, fontWeight: '600' },
  scopeEmpty: { paddingVertical: 10, fontSize: 13, color: color.muted },
  refresh: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  searchRow: { minHeight: 42, marginHorizontal: 18, marginBottom: 10, borderRadius: 12, backgroundColor: color.wash, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: color.ink, paddingVertical: 10 },
  searchClear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  availability: { fontSize: 12, lineHeight: 18, color: color.muted, paddingHorizontal: 20, marginBottom: 6 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 28 },
  group: { paddingTop: 17, paddingBottom: 8, color: color.muted, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  row: { position: 'relative', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowOpen: { paddingTop: 13, paddingBottom: 16, minHeight: 80 },
  rowPressed: { opacity: 0.6 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, minWidth: 0, color: color.ink, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  time: { color: color.muted, fontSize: 11, lineHeight: 18 },
  preview: { color: '#62626A', fontSize: 14, lineHeight: 21, marginTop: 5, paddingRight: 10 },
  context: { color: color.muted, fontSize: 12, lineHeight: 18, marginTop: 6, paddingRight: 35 },
  rowMenu: { position: 'absolute', right: -10, bottom: 0, width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingTop: 70, paddingBottom: 30, alignItems: 'center', gap: 12 },
  emptyTitle: { color: color.ink, fontSize: 16, fontWeight: '600' },
  emptyDetail: { color: color.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  clearSearch: { padding: 12 },
  link: { fontSize: 14, color: color.accent },
  infoTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: color.ink, marginBottom: 20 },
  infoRow: { minHeight: 44, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.line, flexDirection: 'row', gap: 14 },
  infoLabel: { width: 64, color: color.muted, fontSize: 14, lineHeight: 21 },
  infoValue: { flex: 1, minWidth: 0, color: color.ink, fontSize: 14, lineHeight: 21 },
  infoHint: { color: color.muted, fontSize: 13, lineHeight: 21, marginTop: 16, marginBottom: 22 },
  continueButton: { minHeight: 46, borderRadius: 23, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  continueText: { color: color.white, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
