import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { mobileTheme as color } from './mobileTheme';

/** An on-demand surface, so secondary controls never become persistent chat chrome. */
export function MobileSheet({ title, visible, onClose, children }: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={`关闭${title}`} onPress={onClose} style={StyleSheet.absoluteFill}/>
      <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.handle}/>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭面板" onPress={onClose} style={styles.close}><X size={20} color={color.muted}/></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000044' },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '85%', alignSelf: 'center', backgroundColor: color.white, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D5D5D9', alignSelf: 'center', marginTop: 9 },
  header: { minHeight: 56, paddingLeft: 20, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: color.ink },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
});
