import type { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/** Build-time client Firebase configuration; never put server credentials here. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.MOXBOTS_ANDROID_GOOGLE_SERVICES_FILE;
  if (googleServicesFile && (!isAbsolute(googleServicesFile) || !existsSync(googleServicesFile))) {
    throw new Error('MOXBOTS_ANDROID_GOOGLE_SERVICES_FILE must name an existing absolute file outside source control');
  }
  return {
    ...config,
    name: config.name ?? 'MoXBots Mobile Internal',
    slug: config.slug ?? 'moxbots-mobile-internal',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
