import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DraftPersistence } from '../../../mobile/app/src/draftPersistence.ts';

const here = dirname(fileURLToPath(import.meta.url));
const target = { targetId: 'review-fixture', identityKey: 'review-account-device-bot', agentId: 'review-bot' };
const originalText = 'review: original instruction must remain durable';
const copiedText = `review: later destination edit\n\n${originalText}`;
const phases = ['before-destination', 'before-source-clear', 'normal'];
const records = (directory, phase) => {
  const path = session => join(directory, createHash('sha256').update(JSON.stringify(session)).digest('hex') + '.json');
  const read = async (_target, sessionId) => existsSync(path(sessionId)) ? JSON.parse(readFileSync(path(sessionId), 'utf8'))
    : { kind: 'draft', identityKey: target.identityKey, agentId: target.agentId, sessionId, text: '', revision: 0, lastWriteId: null };
  return { read, async write(id, sessionId, expectedRevision, writeId, text) {
    if (phase === 'before-destination' && sessionId === 'materialized') process.exit(41);
    if (phase === 'before-source-clear' && sessionId === null && text === '') process.exit(42);
    const previous = await read(id, sessionId);
    assert.equal(previous.revision, expectedRevision, 'disk CAS');
    const next = { ...previous, text, revision: previous.revision + 1, lastWriteId: writeId };
    writeFileSync(path(sessionId), JSON.stringify(next));
    return next;
  } };
};

if (process.argv[2] === 'child') {
  const directory = process.argv[3], phase = process.argv[4];
  const controller = new DraftPersistence(records(directory, phase), () => {}, randomUUID, 60_000);
  const original = controller.activate(target, null, 1); await original.ready;
  controller.edit(original.key, 1, originalText); await controller.flushOwner(1);
  const source = controller.capture(1);
  const destination = controller.activate(target, 'materialized', 2); await destination.ready;
  // Same entry order as both repaired index.tsx transfer call sites.
  controller.edit(destination.key, 2, copiedText);
  const ticket = controller.capture(2);
  assert.equal(await controller.persistTransferredDraft(source, ticket), true);
  await new Promise(resolve => setImmediate(resolve));
  controller.clear();
} else {
  const output = join(here, 'review-draft-transfer-disks-' + Date.now()); mkdirSync(output);
  const outcomes = [];
  for (const phase of phases) {
    const directory = join(output, phase); mkdirSync(directory);
    const child = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), 'child', directory, phase], { encoding: 'utf8' });
    assert.equal(child.status, phase === 'before-destination' ? 41 : phase === 'before-source-clear' ? 42 : 0, child.stderr);
    // This process has never held the child's memory or timers. Restore through the real API.
    const fresh = new DraftPersistence(records(directory), () => {}, randomUUID, 60_000);
    const source = fresh.activate(target, null, 10); await source.ready; const sourceText = fresh.capture(10)?.text;
    const destination = fresh.activate(target, 'materialized', 11); await destination.ready; const destinationText = fresh.capture(11)?.text;
    fresh.clear();
    assert.ok(sourceText === originalText || destinationText === copiedText, 'at least one durable location survives actual child exit');
    if (phase === 'before-destination') assert.equal(sourceText, originalText);
    if (phase !== 'before-destination') assert.equal(destinationText, copiedText);
    if (phase === 'normal') assert.equal(sourceText, '');
    outcomes.push({ phase, exitCode: child.status, sourceText, destinationText, passed: true });
  }
  console.log(JSON.stringify({ api: 'persistTransferredDraft', output, outcomes }, null, 2));
}
