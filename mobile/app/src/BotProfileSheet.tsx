import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MobileSheet } from './MobileSheet';
import { BotAvatar } from './BotAvatar';
import type { Target } from './native';
import { mobileTheme as c } from './mobileTheme';
export function BotProfileSheet({ target, onClose, onConversations, onNew }: { target: Target | null; onClose: () => void; onConversations: (target: Target) => void; onNew: (target: Target) => void }) {
  return <MobileSheet title="Bot 信息" visible={!!target} onClose={onClose}>{target && <>
    <View style={s.identity}><BotAvatar target={target} size={56}/><View style={s.flex}><Text style={s.name}>{target.name}</Text><Text style={s.detail}>{target.online ? '在线' : '设备离线'} · {target.deviceName}</Text></View></View>
    <Text style={s.label}>执行环境</Text><Text selectable style={s.body}>{target.deviceName} · {target.runtime || '默认运行时'}</Text>
    <Text style={s.hint}>这个 Bot 的会话和成果归属于同一执行环境。返回已有会话可以继续原来的工作；新建会话会开启独立的上下文。</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${target.name} 的会话`} onPress={() => onConversations(target)} style={s.primary}><Text style={s.primaryText}>查看会话</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`与 ${target.name} 新建会话`} onPress={() => onNew(target)} style={s.secondary}><Text style={s.secondaryText}>新建会话</Text></Pressable>
  </>}</MobileSheet>;
}
const s = StyleSheet.create({ identity:{flexDirection:'row',alignItems:'center',gap:14,marginBottom:24},flex:{flex:1},name:{fontSize:22,lineHeight:30,fontWeight:'600',color:c.ink},detail:{fontSize:13,lineHeight:21,color:c.muted,marginTop:4},label:{fontSize:12,color:c.muted,marginBottom:8},body:{fontSize:15,lineHeight:24,color:c.ink},hint:{fontSize:14,lineHeight:23,color:c.muted,marginVertical:22},primary:{minHeight:48,borderRadius:16,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:c.white,fontSize:15,fontWeight:'600'},secondary:{minHeight:48,marginTop:10,borderRadius:16,backgroundColor:c.wash,alignItems:'center',justifyContent:'center'},secondaryText:{color:c.primary,fontSize:15,fontWeight:'600'} });
