import { mobileTheme } from './mobileTheme';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, BellOff, RefreshCw } from 'lucide-react-native';
import { AccountFrame } from './accountScreens';
import { isFixtureMode, type NotificationRegistration } from './native';
import { disableNotifications, enableNotifications, notificationRegistration, systemNotificationPermission, type NotificationPermission } from './notifications';
import { notificationOpens } from './notificationPolicy';

const color = { ...mobileTheme, green: mobileTheme.primary };
const messages: Record<string, string> = {
  MOBILE_AUTHORIZATION_REQUIRED: '请先返回会话页登录，再开启会话提醒。',
  OWNED_LOGIN_REQUIRED: '请先返回会话页登录，再开启会话提醒。',
  ACCOUNT_BINDING_CHANGED: '账号状态已变化，请刷新后重新开启。',
  MOBILE_NOTIFICATIONS_UNAVAILABLE: '提醒服务暂不可用，请稍后重试。',
  MOBILE_NOTIFICATIONS_NOT_CONFIGURED: '此安装包的推送配置尚未就绪，请使用配置完成的内测版本。',
  MOBILE_NOTIFICATION_PERMISSION_DENIED: '系统通知权限未开启。允许通知后，可以重新启用提醒。',
  MOBILE_NOTIFICATION_CANCELLED: '操作已取消。',
};
const errorMessage = (error: unknown) => messages[error instanceof Error ? error.message : ''] ?? '暂时无法确认提醒状态，请检查连接后重试。';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const epoch = useRef(0);
  const focused = useRef(false);
  const [registration, setRegistration] = useState<NotificationRegistration | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('undetermined');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    setBusy(true); setMessage(null);
    const results = await Promise.allSettled([notificationRegistration(), systemNotificationPermission()]);
    if (current !== epoch.current) return;
    const [native, system] = results;
    if (native.status === 'fulfilled') setRegistration(native.value);
    else { setRegistration(null); setMessage(errorMessage(native.reason)); }
    if (system.status === 'fulfilled') setPermission(system.value);
    else { setPermission('unknown'); if (native.status === 'fulfilled') setMessage('暂时无法读取系统通知权限，请刷新后重试。'); }
    setBusy(false);
  }, []);
  useFocusEffect(useCallback(() => { focused.current = true; void refresh(); return () => { focused.current = false; epoch.current += 1; }; }, [refresh]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active' && focused.current && !busy) void refresh(); });
    return () => subscription.remove();
  }, [busy, refresh]);

  const change = async (enabled: boolean) => {
    if (busy) return;
    const current = ++epoch.current;
    setBusy(true); setMessage(null);
    try {
      const result = enabled ? await enableNotifications(() => current === epoch.current) : await disableNotifications();
      if (current !== epoch.current) return;
      setRegistration(result);
      if (enabled && result.state === 'enabled') setPermission('allowed');
      setMessage(result.state === 'unconfirmed' ? '操作结果尚未确认。请刷新状态，或明确重试这项操作。'
        : enabled ? result.state === 'enabled' ? (isFixtureMode ? '演示：已模拟启用会话提醒。' : '会话提醒已启用。') : '会话提醒仍未启用，请重试。'
          : result.state === 'disabled' ? (isFixtureMode ? '演示：已模拟停用会话提醒。' : '会话提醒已停用。') : '尚未确认停用，请重试。');
    } catch (error) {
      if (current !== epoch.current) return;
      setMessage(errorMessage(error));
      // The native owner may have reserved a registration before a timeout.
      try { const result = await notificationRegistration(); if (current === epoch.current) setRegistration(result); } catch { /* Retain the last confirmed state. */ }
      if (error instanceof Error && error.message === 'MOBILE_NOTIFICATION_PERMISSION_DENIED') setPermission('denied');
    } finally { if (current === epoch.current) setBusy(false); }
  };
  const enabled = registration?.state === 'enabled';
  const state = busy ? '正在确认…' : registration?.state === 'unconfirmed' ? '结果待确认' : enabled ? '已启用' : registration?.state === 'disabled' ? '未启用' : '状态暂不可用';
  const permissionLabel: Record<NotificationPermission, string> = { allowed: '已允许', denied: '未允许', undetermined: '尚未请求', unsupported: '此设备不支持', unknown: '暂不可读' };
  return <AccountFrame title="会话提醒">
    <View style={styles.card}>
      <View style={styles.heading}>{enabled ? <Bell size={23} color={color.green}/> : <BellOff size={23} color={color.muted}/>}<Text style={styles.title}>远程会话提醒</Text></View>
      <Text accessibilityRole="header" style={styles.state}>{state}</Text>
      <View style={styles.permissionRow}><Text style={styles.permissionKey}>系统通知权限</Text><Text style={styles.permissionValue}>{busy ? '读取中…' : permissionLabel[permission]}</Text></View>
      {enabled && permission === 'denied' && <Text style={styles.permissionWarning}>提醒已登记，但系统未允许通知，暂时收不到提醒。</Text>}
      <Text style={styles.detail}>会话需要处理或有新成果时提醒你。点击通知后，重新读取会话；授权操作仍需你在会话内确认。</Text>
      <Text style={styles.privacy}>通知不显示会话内容或文件名称。</Text>
      {busy && <ActivityIndicator style={styles.spinner} color={color.green}/>}
      {!enabled && <Pressable accessibilityRole="button" disabled={busy || permission === 'unsupported'} onPress={() => void change(true)} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{registration?.state === 'unconfirmed' ? '重试启用' : '启用会话提醒'}</Text></Pressable>}
      {(enabled || registration?.state === 'unconfirmed') && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void change(false)} style={styles.secondary}><Text style={styles.secondaryText}>{registration?.state === 'unconfirmed' ? '确认停用提醒' : '停用会话提醒'}</Text></Pressable>}
      {permission === 'denied' && !isFixtureMode && <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.secondary}><Text style={styles.secondaryText}>前往系统设置</Text></Pressable>}
    </View>
    {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="刷新提醒状态" disabled={busy} onPress={() => void refresh()} style={styles.refresh}><RefreshCw size={17} color={color.green}/><Text style={styles.secondaryText}>刷新状态</Text></Pressable>
    {permission === 'unsupported' && <Text style={styles.detail}>请在 iPhone 或 Android 内测应用中使用会话提醒。</Text>}
    {isFixtureMode && <View style={styles.card}><Text style={styles.detail}>以下操作仅使用合成数据，不发送推送。</Text><Pressable accessibilityRole="button" onPress={() => { notificationOpens.receive('77777777-7777-4777-8777-777777777777', true); router.replace('/'); }} style={styles.secondary}><Text style={styles.secondaryText}>模拟点击会话通知</Text></Pressable></View>}
  </AccountFrame>;
}

const styles = StyleSheet.create({
  card: { padding: 20, borderWidth: 1, borderColor: color.line, borderRadius: 16, backgroundColor: '#FFFFFF', marginBottom: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { fontSize: 17, fontWeight: '600', color: color.ink },
  state: { marginTop: 20, fontSize: 24, fontWeight: '600', color: color.ink }, detail: { fontSize: 14, lineHeight: 22, color: color.muted, marginTop: 12 },
  privacy: { fontSize: 13, lineHeight: 20, color: color.muted, marginTop: 8 },
  permissionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 14 }, permissionKey: { color: color.muted, fontSize: 14 }, permissionValue: { color: color.ink, fontSize: 14 }, permissionWarning: { color: color.red, fontSize: 14, lineHeight: 22, marginTop: 10 },
  primary: { marginTop: 22, minHeight: 48, borderRadius: 12, backgroundColor: color.green, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  secondary: { marginTop: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: color.green, fontSize: 15, fontWeight: '500' },
  disabled: { opacity: 0.5 }, spinner: { marginTop: 16 }, message: { fontSize: 14, lineHeight: 22, color: color.ink, paddingHorizontal: 6 },
  refresh: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
});
