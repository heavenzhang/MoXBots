import { Text, View, StyleSheet } from 'react-native';
import type { Target } from './native';
import { mobileTheme as c } from './mobileTheme';
/** Until a shared character ID is supplied by the directory, identity is never guessed from a name. */
export function BotAvatar({ target, size = 38 }: { target: Pick<Target, 'name'>; size?: number }) {
  return <View accessible={false} style={[styles.avatar, { width: size, height: size, borderRadius: size * .32 }]}><Text style={{ color: c.primary, fontWeight: '600', fontSize: size * .4 }}>{Array.from(target.name.trim())[0] || 'B'}</Text></View>;
}
const styles = StyleSheet.create({ avatar: { backgroundColor: c.wash, borderWidth: 1, borderColor: '#D4E1D3', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } });
