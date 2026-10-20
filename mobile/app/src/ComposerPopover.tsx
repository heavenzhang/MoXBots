import { useEffect, useRef, type ElementRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { conversationStyles } from './conversationStyles';
import { mobileTheme } from './mobileTheme';

type Control = ElementRef<typeof Pressable>;

function focusControl(control: Control | null) {
  if (!control) return;
  if (Platform.OS === 'web') {
    (control as Control & { focus?: () => void }).focus?.();
  } else {
    const node = findNodeHandle(control);
    if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
  }
}

/** A view-level menu keeps the OS attachment picker on its existing native presenter. */
export function ComposerPopover({ visible, onClose, triggerRef, children }: {
  visible: boolean;
  onClose: () => void;
  triggerRef: RefObject<Control | null>;
  children: ReactNode;
}) {
  const closeRef = useRef<Control>(null);
  const menuRef = useRef<ElementRef<typeof View>>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible) {
      wasOpen.current = true;
      const frame = requestAnimationFrame(() => focusControl(closeRef.current));
      return () => cancelAnimationFrame(frame);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      const frame = requestAnimationFrame(() => focusControl(triggerRef.current));
      return () => cancelAnimationFrame(frame);
    }
  }, [visible, triggerRef]);

  const keyDown = (event: unknown) => {
    if (Platform.OS !== 'web') return;
    const key = event as { key?: string; shiftKey?: boolean; target?: unknown; preventDefault: () => void };
    if (key.key === 'Escape') { key.preventDefault(); onClose(); return; }
    if (key.key !== 'Tab') return;
    const root = menuRef.current as unknown as HTMLElement | null;
    const controls = Array.from(root?.querySelectorAll<HTMLElement>('[role="button"]:not([aria-disabled="true"]),button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])
      .filter((element) => element.getAttribute('tabindex') !== '-1' && element.offsetParent !== null);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (key.shiftKey && key.target === first && last) { key.preventDefault(); last.focus(); }
    else if (!key.shiftKey && key.target === last && first) { key.preventDefault(); first.focus(); }
  };

  if (!visible) return null;
  return <View ref={menuRef} role="dialog" aria-modal={true} accessibilityLabel="添加到会话" accessibilityViewIsModal
    {...(Platform.OS === 'web' ? { onKeyDown: keyDown } : {})} style={conversationStyles.composerMenu}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>添加到会话</Text><Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel="关闭添加菜单" onPress={onClose} style={styles.close}><X size={19} color={mobileTheme.muted}/></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>{children}</ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', marginTop: -9, marginRight: -6, marginBottom: 6 },
  title: { flex: 1, fontSize: 14, color: mobileTheme.ink, fontWeight: '600' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0 },
  content: { paddingBottom: 8 },
});
