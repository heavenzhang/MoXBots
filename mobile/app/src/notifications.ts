import { Platform } from 'react-native';
import { isFixtureMode, requestNative, type NotificationRegistration } from './native';
import { notificationEventId, notificationOpens, NotificationPreferenceFence } from './notificationPolicy';

type PushToken = { type: string; data: unknown };
export type NotificationPermission = 'allowed' | 'denied' | 'undetermined' | 'unsupported' | 'unknown';
const preferenceFence = new NotificationPreferenceFence();

export async function systemNotificationPermission(): Promise<NotificationPermission> {
  if (isFixtureMode) return 'allowed';
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';
  const notifications = await import('expo-notifications');
  const result = await notifications.getPermissionsAsync();
  if (result.granted || result.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL) return 'allowed';
  return result.status === 'denied' || !result.canAskAgain ? 'denied' : 'undetermined';
}

export async function notificationRegistration(): Promise<NotificationRegistration> {
  const reply = await requestNative({ version: 1, kind: 'notification.status' });
  if (reply.kind !== 'notification') throw new Error(reply.kind === 'error' ? reply.code : 'MOBILE_NOTIFICATION_REPLY_INVALID');
  return reply;
}

async function tokenProvider(token: PushToken): Promise<'fcm' | 'apns-sandbox' | 'apns-production'> {
  if (Platform.OS === 'android' && token.type === 'android') return 'fcm';
  if (Platform.OS === 'ios' && token.type === 'ios') {
    const application = await import('expo-application');
    const environment = await application.getIosPushNotificationServiceEnvironmentAsync();
    if (environment === 'development') return 'apns-sandbox';
    if (environment === 'production') return 'apns-production';
  }
  throw new Error('MOBILE_NOTIFICATIONS_NOT_CONFIGURED');
}

async function registerToken(token: PushToken, principalId: string, stillCurrent: () => boolean, automatic = false): Promise<NotificationRegistration> {
  const provider = await tokenProvider(token);
  if (!stillCurrent()) throw new Error('MOBILE_NOTIFICATION_CANCELLED');
  const account = await requestNative({ version: 1, kind: 'account.status' });
  if (!stillCurrent()) throw new Error('MOBILE_NOTIFICATION_CANCELLED');
  if (account.kind !== 'account' || account.state !== 'signed-in' || account.principalId !== principalId) throw new Error('ACCOUNT_BINDING_CHANGED');
  if (typeof token.data !== 'string' || !token.data || token.data.length > 4096) throw new Error('MOBILE_NOTIFICATION_TOKEN_INVALID');
  // Public delivery address exists only in this call's memory. No JS storage,
  // diagnostics, Expo push relay, account bearer or private identity key.
  const reply = await requestNative({ version: 1, kind: automatic ? 'notification.refresh' : 'notification.register', provider, token: token.data });
  if (reply.kind !== 'notification') throw new Error(reply.kind === 'error' ? reply.code : 'MOBILE_NOTIFICATION_REPLY_INVALID');
  return reply;
}

async function enableForCurrentOwner(stillCurrent: () => boolean): Promise<NotificationRegistration> {
  const account = await requestNative({ version: 1, kind: 'account.status' });
  if (account.kind !== 'account' || account.state !== 'signed-in' || !account.principalId) throw new Error('MOBILE_AUTHORIZATION_REQUIRED');
  if (isFixtureMode) {
    const reply = await requestNative({ version: 1, kind: 'notification.register', provider: 'fcm', token: 'qa-synthetic-delivery-address' });
    if (reply.kind !== 'notification') throw new Error('MOBILE_NOTIFICATION_REPLY_INVALID');
    return reply;
  }
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('MOBILE_NOTIFICATIONS_UNAVAILABLE');
  const notifications = await import('expo-notifications');
  if (!stillCurrent()) throw new Error('MOBILE_NOTIFICATION_CANCELLED');
  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync('remote-sessions', {
      name: '远程会话', importance: notifications.AndroidImportance.DEFAULT,
      description: '会话需要处理或有新的成果时提醒', lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  if (!stillCurrent()) throw new Error('MOBILE_NOTIFICATION_CANCELLED');
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    if (!stillCurrent()) throw new Error('MOBILE_NOTIFICATION_CANCELLED');
    permission = await notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  }
  if (!stillCurrent()) throw new Error('MOBILE_NOTIFICATION_CANCELLED');
  if (!permission.granted && permission.ios?.status !== notifications.IosAuthorizationStatus.PROVISIONAL) throw new Error('MOBILE_NOTIFICATION_PERMISSION_DENIED');
  let token: PushToken;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { token = await Promise.race([
    notifications.getDevicePushTokenAsync(),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('MOBILE_NOTIFICATIONS_NOT_CONFIGURED')), 20000); }),
  ]); }
  catch { throw new Error('MOBILE_NOTIFICATIONS_NOT_CONFIGURED'); }
  finally { if (timeout) clearTimeout(timeout); }
  return registerToken(token, account.principalId, stillCurrent);
}

export async function enableNotifications(stillCurrent: () => boolean): Promise<NotificationRegistration> {
  const revision = preferenceFence.beginChange();
  const current = () => stillCurrent() && preferenceFence.isChangeCurrent(revision);
  const result = await enableForCurrentOwner(current);
  if (result.state === 'enabled') preferenceFence.confirmEnabled(revision);
  return result;
}

export async function disableNotifications(): Promise<NotificationRegistration> {
  preferenceFence.beginChange();
  const reply = await requestNative({ version: 1, kind: 'notification.disable' });
  if (reply.kind !== 'notification') throw new Error(reply.kind === 'error' ? reply.code : 'MOBILE_NOTIFICATION_REPLY_INVALID');
  return reply;
}

async function refreshRotatedToken(token: PushToken, active: () => boolean): Promise<void> {
  const revision = preferenceFence.captureAutoRefresh();
  const current = () => active() && preferenceFence.isAutoRefreshCurrent(revision);
  if (!current()) return;
  const account = await requestNative({ version: 1, kind: 'account.status' });
  if (!current() || account.kind !== 'account' || account.state !== 'signed-in' || !account.principalId) return;
  const registration = await notificationRegistration();
  if (!current() || registration.state !== 'enabled') return;
  if (await systemNotificationPermission() !== 'allowed' || !current()) return;
  if (current()) {
    await registerToken(token, account.principalId, current, true);
  }
}

/** Listen only; permission requests and registration remain explicit settings actions. */
export function listenForNotificationTaps(onTap: () => void): () => void {
  if (Platform.OS === 'web' || isFixtureMode) return () => undefined;
  let active = true;
  let removeResponse: () => void = () => undefined;
  let removeToken: () => void = () => undefined;
  void import('expo-notifications').then((notifications) => {
    if (!active) return;
    const accept = (response: unknown, explicitTap: boolean) => {
      const eventId = notificationEventId(response, notifications.DEFAULT_ACTION_IDENTIFIER);
      if (active && eventId && notificationOpens.receive(eventId, explicitTap)) onTap();
    };
    const responseSubscription = notifications.addNotificationResponseReceivedListener((response) => accept(response, true));
    const tokenSubscription = notifications.addPushTokenListener((token) => { void refreshRotatedToken(token, () => active).catch(() => undefined); });
    removeResponse = () => responseSubscription.remove();
    removeToken = () => tokenSubscription.remove();
    accept(notifications.getLastNotificationResponse(), false);
  }).catch(() => undefined);
  return () => { active = false; removeResponse(); removeToken(); };
}

export async function clearHandledNotification(eventId: string): Promise<void> {
  if (Platform.OS === 'web' || isFixtureMode) return;
  try {
    const notifications = await import('expo-notifications');
    if (notificationEventId(notifications.getLastNotificationResponse(), notifications.DEFAULT_ACTION_IDENTIFIER) === eventId) {
      notifications.clearLastNotificationResponse();
    }
  } catch { /* A failed native clear cannot execute or replay any Session action. */ }
}
