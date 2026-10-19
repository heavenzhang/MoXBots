import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForUploadForeground } from '../src/uploadQueue.ts';

test('picker completion waits for actual foreground readiness before starting upload', async () => {
  let ready = false;
  let check = () => {};
  let unsubscribed = 0;
  let started = false;
  const work = waitForUploadForeground(() => ready, () => true, (notify) => {
    check = notify;
    return () => { unsubscribed++; };
  }).then((allowed) => { started = allowed; });
  await Promise.resolve();
  assert.equal(started, false);
  check();
  await Promise.resolve();
  assert.equal(started, false);
  ready = true;
  check();
  await work;
  assert.equal(started, true);
  assert.equal(unsubscribed, 1);
});

test('an owner switch while the picker returns prevents a late upload', async () => {
  let current = true;
  let check = () => {};
  let unsubscribed = false;
  const work = waitForUploadForeground(() => false, () => current, (notify) => {
    check = notify;
    return () => { unsubscribed = true; };
  });
  current = false;
  check();
  assert.equal(await work, false);
  assert.equal(unsubscribed, true);
});

test('missing foreground signal expires and releases listeners without starting upload', async () => {
  let unsubscribed = 0;
  const allowed = await waitForUploadForeground(() => false, () => true, () => () => { unsubscribed++; }, 10);
  assert.equal(allowed, false);
  assert.equal(unsubscribed, 1);
});

test('ready and synchronous subscriptions do not leak a listener or wait for timeout', async () => {
  assert.equal(await waitForUploadForeground(() => true, () => true, () => { throw Error('must not subscribe'); }), true);
  let ready = false;
  let unsubscribed = 0;
  const result = await waitForUploadForeground(() => ready, () => true, (check) => {
    ready = true;
    check();
    return () => { unsubscribed++; };
  });
  assert.equal(result, true);
  assert.equal(unsubscribed, 1);
});
