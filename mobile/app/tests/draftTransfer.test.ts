import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { DraftPersistence } from '../src/draftPersistence.ts';
import type { DraftReply } from '../src/native.ts';

const target = { targetId: 'test-target', identityKey: 'test-account-device-bot', agentId: 'test-bot' };
const other = { targetId: 'other-target', identityKey: 'other-account-device-bot', agentId: 'other-bot' };
const sourceText = 'must survive process interruption';
const nextText = `newer destination edit\n\n${sourceText}`;

function fixture(t: TestContext, beforeWrite: (session: string | null, text: string) => Promise<void> = async () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'moxbots-draft-transfer-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const trace: { session: string | null; text: string }[] = [];
  const file = (id: string, session: string | null) => join(dir, createHash('sha256').update(JSON.stringify([id, session])).digest('hex') + '.json');
  const read = async (id: string, sessionId: string | null): Promise<DraftReply> => {
    const scope = id === target.targetId ? target : other;
    return existsSync(file(id, sessionId)) ? JSON.parse(readFileSync(file(id, sessionId), 'utf8'))
      : { kind: 'draft', identityKey: scope.identityKey, agentId: scope.agentId, sessionId, text: '', revision: 0, lastWriteId: null };
  };
  const io = {
    read,
    async write(id: string, session: string | null, expectedRevision: number, writeId: string, text: string) {
      await beforeWrite(session, text);
      const current = await read(id, session);
      if (current.revision !== expectedRevision) throw new Error('MOBILE_DRAFT_CONFLICT');
      const reply = { ...current, text, revision: current.revision + 1, lastWriteId: writeId };
      writeFileSync(file(id, session), JSON.stringify(reply));
      trace.push({ session, text });
      return reply;
    },
  };
  const create = () => {
    const controller = new DraftPersistence(io, () => {}, randomUUID, 60_000);
    t.after(() => controller.clear());
    return controller;
  };
  return { io, trace, create };
}

async function prepare(controller: DraftPersistence) {
  const original = controller.activate(target, null, 1); await original.ready;
  controller.edit(original.key, 1, sourceText); await controller.flushOwner(1);
  const source = controller.capture(1)!;
  const copied = controller.activate(target, 'materialized', 2); await copied.ready;
  controller.edit(copied.key, 2, nextText);
  return { source, destination: controller.capture(2)!, copied };
}

test('transferred draft is written to disk before source deletion, and restarts with destination edits intact', async (t) => {
  const f = fixture(t); const controller = f.create();
  const { source, destination } = await prepare(controller);
  assert.equal(await controller.persistTransferredDraft(source, destination), true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.trace, [{ session: null, text: sourceText }, { session: 'materialized', text: nextText }, { session: null, text: '' }]);
  controller.clear();
  const restored = f.create(); const opened = restored.activate(target, 'materialized', 3); await opened.ready;
  assert.equal(restored.capture(3)?.text, nextText);
});

test('process loss during an unconfirmed destination write preserves durable source bytes', async (t) => {
  let interrupt!: () => void;
  const gate = new Promise<void>((_resolve, reject) => { interrupt = () => reject(new Error('PROCESS_INTERRUPTED')); });
  const f = fixture(t, async (session) => { if (session === 'materialized') await gate; });
  const controller = f.create(); const { source, destination } = await prepare(controller);
  const transferring = controller.persistTransferredDraft(source, destination);
  await Promise.resolve();
  assert.equal((await f.io.read(target.targetId, null)).text, sourceText);
  assert.equal((await f.io.read(target.targetId, 'materialized')).text, '');
  controller.clear(); interrupt();
  assert.equal(await transferring, false);
  const restarted = f.create(); const opened = restarted.activate(target, null, 3); await opened.ready;
  assert.equal(restarted.capture(3)?.text, sourceText);
  assert.equal(f.trace.some((write) => write.session === null && !write.text), false);
});

for (const failure of ['DISK_FULL', 'MOBILE_DRAFT_CONFLICT']) {
  test(`destination ${failure} never clears source or claims a persisted transfer`, async (t) => {
    const f = fixture(t, async (session) => { if (session === 'materialized') throw new Error(failure); });
    const controller = f.create(); const { source, destination } = await prepare(controller);
    assert.equal(await controller.persistTransferredDraft(source, destination), false);
    controller.clear();
    assert.equal((await f.io.read(target.targetId, null)).text, sourceText);
    assert.equal(f.trace.some((write) => write.session === null && !write.text), false);
  });
}

test('a destination edited while saving cannot clear the original transfer source', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture(t, async (session) => { if (session === 'materialized') await gate; });
  const controller = f.create(); const { source, destination, copied } = await prepare(controller);
  const transferring = controller.persistTransferredDraft(source, destination);
  controller.edit(copied.key, 2, 'user replaced destination while saving');
  release(); assert.equal(await transferring, false);
  assert.equal((await f.io.read(target.targetId, null)).text, sourceText);
  assert.equal((await f.io.read(target.targetId, 'materialized')).text, 'user replaced destination while saving');
});

test('navigation and a newer source edit are preserved while the copied destination becomes durable', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture(t, async (session) => { if (session === 'materialized') await gate; });
  const controller = f.create(); const { source, destination } = await prepare(controller);
  const transferring = controller.persistTransferredDraft(source, destination);
  const back = controller.activate(target, null, 3); await back.ready;
  controller.edit(back.key, 3, 'new independent source edit'); await controller.flushOwner(3);
  release(); assert.equal(await transferring, true);
  assert.equal(controller.capture(3)?.text, 'new independent source edit');
  assert.equal((await f.io.read(target.targetId, null)).text, 'new independent source edit');
  assert.equal((await f.io.read(target.targetId, 'materialized')).text, nextText);
});

test('wrong Bot, missing copied text and stale account tickets cannot clear a source draft', async (t) => {
  const f = fixture(t); const controller = f.create(); const { source, destination, copied } = await prepare(controller);
  controller.edit(copied.key, 2, 'unrelated text');
  assert.equal(await controller.persistTransferredDraft(source, controller.capture(2)!), false);
  const foreign = controller.activate(other, 'materialized', 3); await foreign.ready;
  controller.edit(foreign.key, 3, nextText);
  assert.equal(await controller.persistTransferredDraft(source, controller.capture(3)!), false);
  controller.clear();
  const reopened = controller.activate(target, 'materialized', 4); await reopened.ready;
  controller.edit(reopened.key, 4, nextText);
  assert.equal(await controller.persistTransferredDraft(source, controller.capture(4)!), false);
  assert.equal(await controller.persistTransferredDraft(source, destination), false);
  assert.equal((await f.io.read(target.targetId, null)).text, sourceText);
});
