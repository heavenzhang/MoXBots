import { memo, useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Token, Tokens } from 'marked';
import { messageLink, messageLiteral, parseMessage } from './messagePresentation';

const ink = '#202522';
const muted = '#616B64';
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function openLink(href: string) {
  const url = messageLink(href);
  if (url) void Linking.openURL(url).catch(() => Alert.alert('无法打开链接', '请检查链接或稍后重试。'));
}

// Deliberately do not auto-load remote images from model output (tracking/auth URLs).
function MessageImage({ href, label }: { href: string; label: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = messageLink(href);
  return <View style={s.imageCard}>
    <Text selectable style={s.imageLabel}>{label || '图片'}</Text>
    {loaded && url ? <>{!failed && <Image accessibilityLabel={label || '会话图片'} source={{ uri: url }} resizeMode="contain" style={s.image} onError={() => setFailed(true)}/>}{failed && <Text style={s.hint}>图片加载失败，可打开原链接查看。</Text>}</>
      : <Text style={s.hint}>{url ? '点击后加载外部图片' : '此图片使用本地或受限地址，请从会话成果查看。'}</Text>}
    {url && <View style={s.imageActions}>
      {!loaded && <Pressable accessibilityRole="button" accessibilityLabel={`加载图片：${label || '图片'}`} onPress={() => setLoaded(true)} style={s.action}><Text style={s.link}>加载图片</Text></Pressable>}
      <Pressable accessibilityRole="link" accessibilityLabel={`打开图片原链接：${label || '图片'}`} onPress={() => openLink(url)} style={s.action}><Text style={s.link}>打开原链接</Text></Pressable>
    </View>}
  </View>;
}

function inline(tokens: Token[] | undefined, depth = 0): ReactNode {
  return tokens?.map((token, index) => {
    const key = `${index}:${token.type}`;
    if (depth > 16) return <Text key={key}>{token.raw}</Text>;
    switch (token.type) {
      case 'strong': return <Text key={key} style={s.bold}>{inline(token.tokens, depth + 1)}</Text>;
      case 'em': return <Text key={key} style={s.italic}>{inline(token.tokens, depth + 1)}</Text>;
      case 'del': return <Text key={key} style={s.deleted}>{inline(token.tokens, depth + 1)}</Text>;
      case 'codespan': return <Text key={key} style={s.inlineCode}>{token.text}</Text>;
      case 'br': return '\n';
      case 'link': return messageLink(token.href)
        ? <Text key={key} accessibilityRole="link" style={s.link} onPress={() => openLink(token.href)}>{inline(token.tokens, depth + 1)}</Text>
        : <Text key={key}>{inline(token.tokens, depth + 1)}</Text>;
      case 'image': return <Text key={key}>[图片：{token.text || '图片'}]</Text>;
      case 'text': return token.tokens ? <Text key={key}>{inline(token.tokens, depth + 1)}</Text> : messageLiteral(token.text);
      case 'escape': return token.text;
      default: return token.raw;
    }
  });
}

function paragraph(tokens: Token[], key: string) {
  // Native Text cannot contain block Views. Split top-level image tokens instead.
  const parts: ReactNode[] = [];
  let run: Token[] = [];
  const flush = () => { if (run.length) { parts.push(<Text key={`${key}:${parts.length}`} selectable style={s.text}>{inline(run)}</Text>); run = []; } };
  for (const token of tokens) {
    if (token.type === 'image') { flush(); parts.push(<MessageImage key={`${key}:${parts.length}:${token.href}`} href={token.href} label={token.text}/>); }
    else run.push(token);
  }
  flush();
  return <View key={key} style={s.paragraph}>{parts}</View>;
}

function blocks(tokens: Token[], depth = 0): ReactNode {
  return tokens.map((token, index) => {
    const key = `${index}:${token.type}`;
    if (depth > 16) return <Text key={key} selectable style={s.text}>{token.raw}</Text>;
    switch (token.type) {
      case 'space': case 'def': return null;
      case 'heading': return <Text key={key} accessibilityRole="header" selectable style={[s.heading, token.depth <= 2 ? s.largeHeading : s.smallHeading]}>{inline(token.tokens)}</Text>;
      case 'paragraph': case 'text': return paragraph(token.tokens ?? [{ type: 'text', raw: token.text, text: token.text }], key);
      case 'code': return <View key={key} style={s.codeCard}>
        <Text style={s.codeLabel}>{token.lang?.split(/\s/u)[0] || '代码'} · 左右滑动</Text>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={s.horizontal} contentContainerStyle={s.codeContent} accessibilityLabel="可横向滚动的代码块"><Text selectable style={s.code}>{token.text}</Text></ScrollView>
      </View>;
      case 'blockquote': return <View key={key} style={s.quote}>{blocks(token.tokens ?? [], depth + 1)}</View>;
      case 'hr': return <View key={key} style={s.rule}/>;
      case 'list': return <View key={key} style={s.list}>{(token as Tokens.List).items.map((item, itemIndex) => <View key={itemIndex} style={s.listRow}>
        <Text style={s.bullet}>{item.task ? item.checked ? '☑' : '☐' : token.ordered ? `${Number(token.start) + itemIndex}.` : '•'}</Text>
        <View style={s.listBody}>{blocks(item.tokens, depth + 1)}</View>
      </View>)}</View>;
      case 'table': return <View key={key} style={s.tableCard}>
        <Text style={s.tableHint}>表格 · 左右滑动查看</Text>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={s.horizontal} accessibilityLabel="可横向滚动的表格"><View>
          {[(token as Tokens.Table).header, ...(token as Tokens.Table).rows].map((row, rowIndex) => <View key={rowIndex} style={[s.tableRow, rowIndex === 0 && s.tableHead]}>{row.map((cell, cellIndex) => <View key={cellIndex} style={s.cell}><Text selectable style={[s.text, rowIndex === 0 && s.bold, { textAlign: token.align[cellIndex] ?? 'left' }]}>{inline(cell.tokens)}</Text></View>)}</View>)}
        </View></ScrollView>
      </View>;
      // Raw HTML is inert text. No WebView, HTML injection or automatic resource fetch.
      default: return <Text key={key} selectable style={s.text}>{token.raw}</Text>;
    }
  });
}

export const MessageContent = memo(function MessageContent({ content }: { content: string }) {
  const tokens = useMemo(() => parseMessage(content), [content]);
  return <View style={s.root}>{blocks(tokens)}</View>;
});

const s = StyleSheet.create({
  root: { width: '100%', minWidth: 0, gap: 8 }, text: { color: ink, fontSize: 16, lineHeight: 25, flexShrink: 1, ...(Platform.OS === 'web' ? { overflowWrap: 'anywhere' as const } : {}) },
  paragraph: { gap: 8 }, heading: { color: ink, fontWeight: '700', marginTop: 8, marginBottom: 2 }, largeHeading: { fontSize: 21, lineHeight: 29 }, smallHeading: { fontSize: 18, lineHeight: 26 },
  bold: { fontWeight: '700' }, italic: { fontStyle: 'italic' }, deleted: { textDecorationLine: 'line-through' }, link: { color: '#1C6A48', textDecorationLine: 'underline' },
  inlineCode: { fontFamily: mono, backgroundColor: '#EAF0EC', fontSize: 14 }, quote: { borderLeftWidth: 3, borderColor: '#ADC8B7', paddingLeft: 12, gap: 6 }, rule: { height: 1, backgroundColor: '#DCE4DE', marginVertical: 8 },
  list: { gap: 6 }, listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, bullet: { minWidth: 21, color: muted, fontSize: 16, lineHeight: 25 }, listBody: { flex: 1, minWidth: 0, gap: 6 },
  horizontal: { width: '100%', flexGrow: 0 }, codeCard: { width: '100%', minWidth: 0, borderRadius: 10, backgroundColor: '#EDF1EE', overflow: 'hidden' },
  codeLabel: { color: muted, fontSize: 11, paddingHorizontal: 12, paddingTop: 9 }, codeContent: { padding: 12 }, code: { color: ink, fontSize: 13, lineHeight: 21, fontFamily: mono },
  tableCard: { width: '100%', minWidth: 0, borderWidth: 1, borderColor: '#DCE4DE', borderRadius: 8, overflow: 'hidden' }, tableHint: { color: muted, padding: 8, fontSize: 11 }, tableRow: { flexDirection: 'row' }, tableHead: { backgroundColor: '#EAF0EC' }, cell: { width: 160, padding: 10, borderTopWidth: 1, borderRightWidth: 1, borderColor: '#DCE4DE' },
  imageCard: { width: '100%', gap: 6, padding: 10, borderWidth: 1, borderColor: '#DCE4DE', borderRadius: 8 }, image: { width: '100%', height: 200 }, imageLabel: { color: ink, fontSize: 14 }, hint: { color: muted, fontSize: 12, lineHeight: 18 }, imageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, action: { minHeight: 44, justifyContent: 'center' },
});
