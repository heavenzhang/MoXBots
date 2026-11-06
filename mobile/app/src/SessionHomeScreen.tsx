import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight, CircleUserRound, MoreHorizontal, SlidersHorizontal, FileText, MessageCircle, RefreshCw, Search, SquarePen, UsersRound, X } from 'lucide-react-native';
import { accountIdentityLabel } from './accountPolicy';
import type { Account, Target } from './native';
import { MobileSheet } from './MobileSheet';
import { BotAvatar } from './BotAvatar';
import { BotProfileSheet } from './BotProfileSheet';
import { botKey, botSessionKey, botSessionStatus, botSessionAction, botStatusCoverage, type BotDirectoryPage, type BotSession } from './botDirectory';
import { mobileTheme as c } from './mobileTheme';
import { sessionUpdatedLabel } from './sessionPresentation';

type Props = {
  account: Account | null; focusBot: { key: string; serial: number } | null;
  targets: readonly Target[]; target: Target | null; rows: readonly BotSession[]; pages: readonly BotDirectoryPage[];
  search: string; searchOpen: boolean; onSearch: (value: string) => void; onSearchOpen: (value: boolean) => void;
  busy: boolean; syncIssueCount: number; unavailableDeviceCount: number; onAccount: () => void; onRefresh: () => void;
  onNew: (target: Target) => void; onOpen: (row: BotSession) => void; onArtifacts: (row: BotSession) => void;
  statusReading: boolean; onReadStatuses: (keys: readonly string[]) => void;
  notice?: ReactNode; pending?: ReactNode; empty: ReactNode;
};
type Tab = 'chats' | 'bots' | 'artifacts';
/** One catalog, three views. Every action carries the original Bot identity and session. */
export function SessionHomeScreen(p: Props) {
  const [tab, setTab] = useState<Tab>('chats');
  const [scope, setScope] = useState<string | null>(p.targets.some(t => botKey(t) === p.focusBot?.key) ? p.focusBot!.key : null);
  const [filter, setFilter] = useState<'all' | 'attention' | 'active'>('all');
  const [choosingBot, setChoosingBot] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<Target | null>(null);
  const query = p.search.trim().toLocaleLowerCase();
  const scoped = p.rows.filter(row => (!scope || botKey(row.target) === scope) && (!query || [row.title, row.preview, row.target.name, row.target.deviceName].some(value => value.toLocaleLowerCase().includes(query))));
  const rows = scoped.filter(row => tab !== 'chats' || filter === 'all' || botSessionStatus(row).tone === filter);
  const coverage = botStatusCoverage(scoped);
  const bots = p.targets.filter(target => !query || [target.name, target.deviceName].some(value => value.toLocaleLowerCase().includes(query)));
  const newWork = () => { const selected = p.targets.find(t => botKey(t) === scope); if (selected) p.onNew(selected); else if (p.targets.length === 1) p.onNew(p.targets[0]); else if (p.targets.length) setChoosingBot(true); else setTab('bots'); };
  const validProfile = profile && p.targets.find(t => botKey(t) === botKey(profile)) || null;
  return <View style={s.page}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={[s.heading,s.flex]}>{tab === 'chats' ? '继续工作' : tab === 'bots' ? '我的 Bots' : '成果'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="新建会话" onPress={newWork} style={s.icon}><SquarePen size={23} color={c.primary}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`更多选项，当前账号${accountIdentityLabel(p.account)}`} accessibilityState={{expanded:toolsOpen}} onPress={() => setToolsOpen(true)} style={s.icon}><MoreHorizontal size={24} color={c.ink}/></Pressable>
    </View>
    <View style={s.listToolbar}>
      <Text style={[s.small,s.flex]}>{tab === 'chats' ? '最近会话' : tab === 'bots' ? '与你协作的 Bots' : '按会话查看'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="搜索会话和 Bots" accessibilityState={{expanded:p.searchOpen || !!p.search}} onPress={() => p.onSearchOpen(true)} style={s.icon}><Search size={20} color={c.muted}/></Pressable>
      {tab !== 'bots' && <Pressable accessibilityRole="button" accessibilityLabel="筛选会话" accessibilityState={{expanded:filtersOpen}} onPress={() => setFiltersOpen(true)} style={s.icon}><SlidersHorizontal size={20} color={scope || (tab === 'chats' && filter !== 'all') ? c.primary : c.muted}/></Pressable>}
    </View>
    {(p.searchOpen || !!p.search) && <View style={s.search}><TextInput autoFocus accessibilityLabel="搜索已加载的会话和 Bots" value={p.search} onChangeText={p.onSearch} placeholder="任务、内容或 Bot 名称" placeholderTextColor={c.muted} style={s.input}/><Pressable accessibilityRole="button" accessibilityLabel="清除并关闭搜索" onPress={() => {p.onSearch('');p.onSearchOpen(false);}} style={s.icon}><X size={18} color={c.muted}/></Pressable></View>}
    {tab !== 'bots' && (scope || (tab === 'chats' && filter !== 'all')) && <View style={s.activeFilters}><Pressable accessibilityRole="button" accessibilityLabel="修改当前筛选" onPress={() => setFiltersOpen(true)} style={s.activeFilterLabel}><Text style={s.small}>{[scope ? p.targets.find(t => botKey(t) === scope)?.name || '已选 Bot' : null, tab === 'chats' && filter !== 'all' ? filter === 'attention' ? '需要你' : '进行中' : null].filter(Boolean).join(' · ')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="清除筛选" onPress={() => {setScope(null);setFilter('all');}} style={s.icon}><X size={18} color={c.muted}/></Pressable></View>}
    {p.notice}
    <ScrollView style={s.list} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {p.pending}
      {tab === 'chats' && (coverage.unread > 0 || coverage.failed > 0) && <View style={{ backgroundColor: c.wash, borderRadius: 12, padding: 12, marginBottom: 12 }}><Text style={s.small}>{coverage.unread > 0 ? `还有 ${coverage.unread} 项会话状态待同步，筛选数量仅包含已读取的状态。` : '部分状态刷新未成功，当前显示最近已读取的结果。'}</Text><Pressable accessibilityRole="button" accessibilityLabel="为当前筛选继续读取会话状态" disabled={p.busy} accessibilityState={{ disabled: p.busy }} onPress={() => p.onReadStatuses(scoped.map(botSessionKey))} style={[s.botAction, p.busy && { opacity: 0.5 }]}><Text style={s.action}>{p.statusReading ? '正在同步状态…' : coverage.unread > coverage.failed ? '继续同步状态' : '重试未同步状态'}</Text></Pressable></View>}
      {p.unavailableDeviceCount > 0 && <Text style={s.coverage}>另有 {p.unavailableDeviceCount} 台设备目录暂不可用</Text>}
      {(p.syncIssueCount > 0 || p.pages.some(page => page.error)) && <Text accessibilityRole="alert" style={s.coverage}>部分 Bot 暂未同步，已读取的会话仍保留。可刷新重试。</Text>}
      {tab === 'bots' ? bots.map(t => <View key={botKey(t)} style={s.botCard}><Pressable accessibilityRole="button" accessibilityLabel={`查看 Bot：${t.name}`} onPress={() => setProfile(t)} style={s.botHead}><BotAvatar target={t} size={46}/><View style={s.flex}><Text style={s.title}>{t.name}</Text><Text style={s.small}>{t.deviceName} · {t.online ? '在线' : '离线'}</Text></View><ChevronRight size={18} color={c.muted}/></Pressable><View style={s.botActions}><Pressable accessibilityRole="button" accessibilityLabel={`继续 ${t.name} 的工作`} onPress={() => {setScope(botKey(t));setFilter('all');setTab('chats');}} style={s.botAction}><Text style={s.action}>查看会话</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`与 ${t.name} 新建会话`} onPress={() => p.onNew(t)} style={s.botAction}><Text style={s.action}>新建会话</Text></Pressable></View></View>) : <>
        {tab === 'artifacts' && <Text style={s.coverage}>按原会话查看已交付文件，继续修改时会回到对应 Bot 和会话。</Text>}
        {rows.map(row => {const status=botSessionStatus(row); return <View key={botSessionKey(row)} style={s.card}><View style={s.cardTop}><Pressable accessibilityRole="button" accessibilityLabel={`查看 Bot：${row.target.name}`} onPress={() => setProfile(row.target)} style={s.identity}><BotAvatar target={row.target} size={36}/><Text numberOfLines={1} style={s.botName}>{row.target.name}</Text></Pressable><Text style={s.time}>{sessionUpdatedLabel(row.updatedAt)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${tab === 'artifacts' ? '查看成果' : '打开会话'}：${row.title || '新会话'}`} accessibilityHint={`${status.label}。${status.detail}`} onPress={() => tab === 'artifacts' ? p.onArtifacts(row) : p.onOpen(row)} style={s.cardMain}><Text numberOfLines={2} style={s.title}>{row.title || '新会话'}</Text>{!!row.preview && <Text numberOfLines={2} style={s.preview}>{row.preview}</Text>}<View style={s.cardBottom}><Text style={[s.status,status.tone==='attention' && s.attention,status.tone==='error' && s.error]}>{status.label}</Text><Text style={[s.action,s.continueAction]}>{tab === 'artifacts' ? '查看成果' : botSessionAction(row)} →</Text></View>{status.tone === 'error' && <Text style={s.statusDetail}>{status.detail}</Text>}</Pressable></View>;})}
        {rows.length === 0 && (p.busy ? <View style={s.empty}><ActivityIndicator color={c.primary}/><Text style={s.small}>正在同步会话…</Text></View> : query || scope || filter !== 'all' ? <View style={s.empty}><Text style={s.title}>暂无匹配的会话</Text><Text style={s.emptyText}>可清除筛选查看已读取的最近工作。</Text><Pressable accessibilityRole="button" onPress={() => {setScope(null);setFilter('all');p.onSearch('');}} style={s.botAction}><Text style={s.action}>查看全部</Text></Pressable></View> : p.empty)}
        {p.pages.some(page => page.hasMore) && <Text style={s.coverage}>每个 Bot 先显示最近 30 条会话</Text>}
      </>}
      {tab === 'bots' && bots.length === 0 && p.empty}
    </ScrollView>
    <View style={s.nav}>{([{id:'chats',label:'会话',Icon:MessageCircle},{id:'bots',label:'Bots',Icon:UsersRound},{id:'artifacts',label:'成果',Icon:FileText}] as const).map(({id,label,Icon}) => <Pressable key={id} accessibilityRole="tab" accessibilityLabel={`${label}导航`} accessibilityState={{selected:tab===id}} onPress={() => setTab(id)} style={s.navItem}><View style={[s.navIcon,tab===id && s.navActive]}><Icon size={21} color={tab===id?c.primary:c.muted}/></View><Text style={[s.navLabel,tab===id && s.selectedText]}>{label}</Text></Pressable>)}</View>
    <MobileSheet title="更多选项" visible={toolsOpen} onClose={() => setToolsOpen(false)}>
      <Text style={s.small}>当前账号 · {accountIdentityLabel(p.account)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="刷新会话和设备" disabled={p.busy} accessibilityState={{disabled:p.busy}} onPress={() => {setToolsOpen(false);p.onRefresh();}} style={s.menuRow}><RefreshCw size={20} color={c.primary}/><Text style={s.menuLabel}>刷新会话和设备</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="账号与设置" onPress={() => {setToolsOpen(false);p.onAccount();}} style={s.menuRow}><CircleUserRound size={20} color={c.primary}/><Text style={s.menuLabel}>账号与设置</Text></Pressable>
      <Text style={s.coverage}>显示最近读取的会话状态，打开后会再次同步。每个 Bot 最多显示最近 30 条会话。</Text>
    </MobileSheet>
    <MobileSheet title="筛选会话" visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
      <Text style={s.filterHeading}>Bot</Text>
      <View style={s.filterChoices}><Chip label="全部 Bots" selected={!scope} onPress={() => setScope(null)}/>{p.targets.map(t => <Chip key={botKey(t)} label={t.name} selected={scope === botKey(t)} onPress={() => setScope(botKey(t))}/>)}</View>
      {tab === 'chats' && <><Text style={s.filterHeading}>状态</Text><View style={s.filterChoices}>{([['all','全部'],['attention','需要你'],['active','进行中']] as const).map(([value,label]) => <Chip key={value} label={label + (value !== 'all' ? ` ${scoped.filter(r => botSessionStatus(r).tone === value).length}${coverage.unread > 0 ? '+' : ''}` : '')} selected={filter===value} onPress={() => setFilter(value)}/>)}</View><Text style={s.coverage}>数量仅包含已读取的状态，未同步会话可能尚未计入。</Text></>}
      <Pressable accessibilityRole="button" accessibilityLabel="完成筛选" onPress={() => setFiltersOpen(false)} style={s.filterDone}><Text style={s.filterDoneText}>完成</Text></Pressable>
    </MobileSheet>
    <MobileSheet title="选择执行 Bot" visible={choosingBot} onClose={() => setChoosingBot(false)}>{p.targets.map(t => <Pressable key={botKey(t)} accessibilityRole="button" accessibilityLabel={`选择 ${t.name} 新建会话`} onPress={() => {setChoosingBot(false);p.onNew(t);}} style={s.botHead}><BotAvatar target={t}/><View style={s.flex}><Text style={s.title}>{t.name}</Text><Text style={s.small}>{t.deviceName} · {t.online ? '在线' : '离线，可保留草稿'}</Text></View><ChevronRight size={18} color={c.muted}/></Pressable>)}</MobileSheet>
    <BotProfileSheet target={validProfile} onClose={() => setProfile(null)} onConversations={t => {setScope(botKey(t));setTab('chats');setFilter('all');setProfile(null);}} onNew={t => {setProfile(null);p.onNew(t);}}/>
  </View>;
}
function Chip({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) {return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[s.chip,selected&&s.chipActive]}><Text numberOfLines={1} style={[s.small,selected&&s.selectedText]}>{label}</Text></Pressable>;}
const s=StyleSheet.create({
continueAction:{paddingVertical:10},
listToolbar:{flexDirection:'row',alignItems:'center',paddingLeft:24,paddingRight:16,marginBottom:0},
activeFilters:{flexDirection:'row',alignItems:'center',marginHorizontal:24,backgroundColor:c.wash,borderRadius:12,paddingLeft:12,marginBottom:8},activeFilterLabel:{flex:1,minHeight:44,justifyContent:'center'},
menuRow:{minHeight:56,flexDirection:'row',alignItems:'center',gap:14,borderBottomWidth:1,borderColor:c.line},menuLabel:{fontSize:16,lineHeight:24,color:c.ink},
filterHeading:{fontSize:16,lineHeight:24,fontWeight:'600',color:c.ink,marginTop:16,marginBottom:12},filterChoices:{flexDirection:'row',flexWrap:'wrap',gap:10},filterDone:{minHeight:52,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:c.primary,marginTop:20},filterDoneText:{fontSize:16,fontWeight:'600',color:c.white},
page: { flex:1,minHeight:0,backgroundColor:c.white },flex:{flex:1,minWidth:0},header: { flexDirection:'row',alignItems:'center',paddingLeft:24,paddingRight:12,paddingTop:20,paddingBottom:4 },heading: { fontSize:30,lineHeight:40,fontWeight:'600',color:c.ink,letterSpacing:-0.6 },icon:{width:44,height:44,alignItems:'center',justifyContent:'center'},search:{flexDirection:'row',alignItems:'center',marginHorizontal:24,marginBottom:12,borderRadius:14,backgroundColor:c.canvas,paddingLeft:14},input:{flex:1,minWidth:0,fontSize:15,color:c.ink,minHeight:44},chip: { minHeight:44,maxWidth:180,paddingHorizontal:16,alignItems:'center',justifyContent:'center',borderRadius:22,backgroundColor:c.canvas },chipActive: { backgroundColor:c.wash },small: { fontSize:14,lineHeight:22,color:c.muted },selectedText:{color:c.primary,fontWeight:'600'},list:{flex:1},content: { paddingHorizontal:24,paddingBottom:28 },card: { backgroundColor:c.white,paddingVertical:20,borderBottomWidth:1,borderColor:c.line },cardTop: { flexDirection:'row',alignItems:'center',gap:8,marginBottom:4 },identity: { flex:1,minWidth:0,minHeight:44,flexDirection:'row',alignItems:'center',gap:10,paddingRight:8 },botName: { fontSize:13,lineHeight:20,color:c.muted,flexShrink:1 },time: { fontSize:12,lineHeight:18,color:c.muted },cardMain: { paddingBottom:4 },title: { fontSize:20,lineHeight:28,fontWeight:'600',color:c.ink },preview: { fontSize:15,lineHeight:25,color:c.muted,marginTop:10 },cardBottom: { flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:8 },statusDetail: { fontSize:13,lineHeight:21,color:c.muted,marginTop:10 },status: { fontSize:13,lineHeight:22,color:c.primary,fontWeight:'500' },attention: { color:'#89631D' },error: { color:'#A44236' },action: { fontSize:15,lineHeight:22,fontWeight:'600',color:c.primary },botCard: { backgroundColor:c.white,borderBottomWidth:1,borderColor:c.line,paddingVertical:12 },botHead: { flexDirection:'row',alignItems:'center',gap:16,paddingVertical:16 },botActions: { flexDirection:'row',borderTopWidth:1,borderColor:c.line },botAction: { flex:1,minHeight:52,justifyContent:'center',alignItems:'center' },coverage: { fontSize:13,lineHeight:22,color:c.muted,marginVertical:20 },empty:{paddingVertical:35,alignItems:'center',gap:12},emptyText:{fontSize:13,lineHeight:22,color:c.muted,textAlign:'center'},nav: { flexDirection:'row',borderTopWidth:1,borderColor:c.line,backgroundColor:c.white,paddingTop:10,paddingBottom:8 },navItem: { flex:1,alignItems:'center',justifyContent:'center',minHeight:58,gap:5 },navIcon: { width:60,height:32,borderRadius:16,alignItems:'center',justifyContent:'center' },navActive:{backgroundColor:c.wash},navLabel: { fontSize:13,lineHeight:18,color:c.muted }});
