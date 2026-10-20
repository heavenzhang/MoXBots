import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from './mobileTheme';

type Tool = { name: string; status: 'running' | 'complete' | 'error'; summary: string };
/** Display-only. Opening an output never invokes a tool, retries or grants permission. */
export function ToolResult({ tool }: { tool: Tool }) {
  const [expanded, setExpanded] = useState(false);
  const status = tool.status === 'running' ? '运行中' : tool.status === 'error' ? '失败' : '完成';
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${tool.name}，${status}，${expanded ? '收起输出' : '展开输出'}`}
      accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.header}>
      <Text style={[styles.status, tool.status === 'error' && styles.error]}>{status}</Text>
      <Text style={styles.name}>{tool.name}</Text><Text style={styles.toggle}>{expanded ? '收起' : '查看输出'}</Text>
    </Pressable>
    {expanded && (tool.summary ? <ScrollView nestedScrollEnabled accessibilityLabel={`${tool.name} 的只读输出`} style={styles.output}>
      <ScrollView horizontal nestedScrollEnabled accessibilityLabel={`${tool.name} 的横向输出`}><Text selectable style={styles.text}>{tool.summary}</Text></ScrollView>
    </ScrollView> : <Text style={styles.empty}>{tool.status === 'running' ? '暂时没有输出。' : '没有文本输出。'}</Text>)}
  </View>;
}
const styles = StyleSheet.create({
  card: { width: '100%', marginTop: 8, borderWidth: 1, borderColor: mobileTheme.line, borderRadius: 10, overflow: 'hidden' },
  header: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 12, color: mobileTheme.muted }, error: { color: mobileTheme.red },
  name: { flex: 1, flexShrink: 1, fontSize: 13, color: mobileTheme.ink, fontWeight: '600' },
  toggle: { color: mobileTheme.muted, fontSize: 12 }, output: { maxHeight: 280, backgroundColor: mobileTheme.canvas },
  text: { padding: 12, fontSize: 12, lineHeight: 18, color: mobileTheme.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  empty: { padding: 12, fontSize: 12, color: mobileTheme.muted },
});
