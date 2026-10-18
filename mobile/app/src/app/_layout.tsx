import { router, Stack, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { listenForNotificationTaps } from '../notifications';

export default function RootLayout() {
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const currentPath = useRef(pathname);
  useEffect(() => { currentPath.current = pathname; }, [pathname]);
  useEffect(() => {
    if (!navigation?.key) return;
    return listenForNotificationTaps(() => { if (currentPath.current !== '/') router.replace('/'); });
  }, [navigation?.key]);
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#FFFFFF' } }} />;
}
