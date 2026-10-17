const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

/** Permissions belong to the installed internal app, requested only on a mic tap. */
module.exports = function withMoxBotsRemote(config) {
  config = withInfoPlist(config, (entry) => {
    entry.modResults.NSMicrophoneUsageDescription = '用于录制你主动发起的语音输入。';
    entry.modResults.NSSpeechRecognitionUsageDescription = '将语音转换为可编辑的消息草稿。';
    entry.modResults.MoxBotsServiceOrigin = 'https://140.143.183.232';
    return entry;
  });
  return withAndroidManifest(config, (entry) => {
    const manifest = entry.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) throw new Error('MoxBots native application manifest missing');
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = 'false';
    const permissions = manifest['uses-permission'] ?? [];
    if (!permissions.some((item) => item.$?.['android:name'] === 'android.permission.RECORD_AUDIO')) {
      permissions.push({ $: { 'android:name': 'android.permission.RECORD_AUDIO' } });
    }
    manifest['uses-permission'] = permissions;
    const queries = manifest.queries ?? [];
    if (!queries.some((query) => query.intent?.some((intent) => intent.action?.some((action) =>
      action.$?.['android:name'] === 'android.speech.RecognitionService')))) {
      queries.push({ intent: [{ action: [{ $: { 'android:name': 'android.speech.RecognitionService' } }] }] });
    }
    manifest.queries = queries;
    const metadata = application['meta-data'] ?? [];
    const key = 'com.moxbots.mobile.SERVICE_ORIGIN';
    const existing = metadata.find((item) => item.$?.['android:name'] === key);
    if (existing) existing.$['android:value'] = 'https://140.143.183.232';
    else metadata.push({ $: { 'android:name': key, 'android:value': 'https://140.143.183.232' } });
    application['meta-data'] = metadata;
    return entry;
  });
};
