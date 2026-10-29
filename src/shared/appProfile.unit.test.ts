import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test.each(['moxbot', 'moxbot-updaterqa', 'moxbot-modelqa'])(
  '%s website links remain inside the reserved MoXBots mount',
  async profile => {
    vi.stubGlobal('__MYAGENTS_BUILD_PROFILE__', profile);
    vi.stubGlobal('__MYAGENTS_UPDATER_QA__', profile === 'moxbot-updaterqa');
    vi.stubGlobal('__MYAGENTS_MODEL_QA__', profile === 'moxbot-modelqa');
    const { APP_WEBSITE_URL } = await import('./appProfile');
    expect(new URL(APP_WEBSITE_URL).origin).toBe('https://101.42.11.29');
    expect(new URL(APP_WEBSITE_URL).pathname).toBe('/moxbots/');
    // Both existing consumers must resolve the same nested download route.
    expect(new URL(`${APP_WEBSITE_URL}download/`).pathname).toBe('/moxbots/download/');
    expect(new URL(`${APP_WEBSITE_URL.replace(/\/$/, '')}/download/`).pathname).toBe('/moxbots/download/');
  },
);

test('the upstream product keeps its own website and data identity', async () => {
  vi.stubGlobal('__MYAGENTS_BUILD_PROFILE__', 'myagents');
  vi.stubGlobal('__MYAGENTS_UPDATER_QA__', false);
  vi.stubGlobal('__MYAGENTS_MODEL_QA__', false);
  const { APP_WEBSITE_URL, APP_DATA_DIR_NAME } = await import('./appProfile');
  expect(APP_WEBSITE_URL).toBe('https://myagents.io');
  expect(APP_DATA_DIR_NAME).toBe('.myagents');
});
