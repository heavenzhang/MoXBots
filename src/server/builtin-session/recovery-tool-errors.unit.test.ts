import { expect, it, vi } from 'vitest';
import { applyTranscriptBatch, createTranscriptProjection } from '../../shared/sessionTranscript';
import { ProductTranscriptContent } from '../session-transcript/content';
import { TranscriptWriter } from '../session-transcript/writer';
import { recoveryActionHash } from '../openai-bridge/context-recovery';
import { repairReviewedToolErrors } from './recovery-tool-errors';

function fixture() {
  const durable = createTranscriptProjection();
  const append = vi.fn(async (_expected, batch) => { applyTranscriptBatch(durable, batch.operations); });
  const writer = new TranscriptWriter({ sessionId: 's', generation: 'g', revision: 0, projection: createTranscriptProjection(),
    storage: { append, replace: vi.fn() } });
  const content = new ProductTranscriptContent(writer);
  content.admitUser({ id: 'u', role: 'user', content: 'Earlier work', timestamp: '2026-10-29T00:00:00Z' });
  const evidence = [0, 1, 2, 3].map(index => {
    const input = { command: `synthetic-${index}` };
    const target = content.startTool(`old-${index}`, 'Bash')!;
    content.confirmInput(target, input);
    content.confirmText(target, 'result', 'Synthetic hook denial');
    content.updateTool(target, { input: {}, isLoading: false }, true);
    return { toolUseId: `old-${index}`, toolName: 'Bash', actionHash: recoveryActionHash('Bash', input) };
  });
  content.finishTurn('complete');
  return { content, evidence, durable, writer, append };
}

it('appends only error metadata to four verified old tools and retains it in a cold projection', async () => {
  const f = fixture(); await f.writer.flushForMutation();
  const before = structuredClone([...f.durable.messages.values()]);
  const operations: unknown[] = []; f.writer.subscribeOperations(operation => operations.push(operation));
  await repairReviewedToolErrors(f.content, f.evidence, () => true);
  expect(operations).toHaveLength(4);
  for (const operation of operations) expect(operation).toMatchObject({ kind: 'block-update', target: 'tool', details: { isError: true } });
  const cold = new ProductTranscriptContent(new TranscriptWriter({ sessionId: 's', generation: 'g', revision: f.writer.status.durableRevision,
    projection: f.durable, storage: { append: vi.fn(), replace: vi.fn() } }));
  for (const proof of f.evidence) expect(cold.readTool(cold.tool(proof.toolUseId)!)?.isError).toBe(true);
  const after = structuredClone([...f.durable.messages.values()]);
  for (const message of after) if (Array.isArray(message.content)) for (const block of message.content) {
    if (block.tool && typeof block.tool === 'object' && !Array.isArray(block.tool)) delete block.tool.isError;
  }
  expect(after).toEqual(before);
  await f.writer.close(); await cold.writer.close();
});

it.each(['hash', 'name', 'duplicate', 'owner'])('refuses product repair on %s mismatch', async change => {
  const f = fixture();
  if (change === 'hash') f.evidence[0]!.actionHash = 'a'.repeat(64);
  if (change === 'name') f.evidence[0]!.toolName = 'Write';
  if (change === 'duplicate') {
    const message = f.content.writer.projection.messages.values().find(message => Array.isArray(message.content) && message.content.length > 0)!;
    if (Array.isArray(message.content)) message.content.push(structuredClone(message.content[0]!));
  }
  await expect(repairReviewedToolErrors(f.content, f.evidence, () => change !== 'owner')).rejects.toThrow('recovery_review');
  for (const proof of f.evidence) expect(f.content.readTool(f.content.tool(proof.toolUseId)!)?.isError).not.toBe(true);
  await f.writer.close();
});
