import assert from 'node:assert/strict';
import test from 'node:test';
import { appendArtifactRevisionDraft, artifactContentLabel, artifactRevisionDraft, mergeArtifactPage } from '../src/artifactPresentation.ts';
import type { ArtifactDescriptor } from '../src/native.ts';

const first: ArtifactDescriptor = { artifactId: '11111111-1111-4111-8111-111111111111', name: '报告 V99.pdf', mimeType: 'application/pdf', sizeBytes: 100, sha256: 'a'.repeat(64) };
const changed: ArtifactDescriptor = { ...first, artifactId: '22222222-2222-4222-8222-222222222222', sha256: 'b'.repeat(64) };

test('real content identities retain same-name deliveries and multiple files across pages', () => {
  const another = { ...first, artifactId: '33333333-3333-4333-8333-333333333333', name: '预算.xlsx' };
  assert.deepEqual(mergeArtifactPage([first], [changed, another, first]), [first, changed, another]);
  assert.equal(artifactContentLabel(first), `内容 ${'a'.repeat(12)}`);
  assert.equal(artifactContentLabel(first).includes('V99'), false, 'a filename is never interpreted as version order');
});

test('an opaque artifact ID cannot change metadata across refresh or pagination', () => {
  for (const mutation of [{ name: 'changed.pdf' }, { sha256: 'c'.repeat(64) }, { mimeType: 'text/plain' }, { sizeBytes: 101 }]) {
    assert.throws(() => mergeArtifactPage([first], [{ ...first, ...mutation }]), /MOBILE_ARTIFACT_DESCRIPTOR_CHANGED/);
  }
});

test('revision is an explicit source quote with exact stable identity and hash; existing draft survives', () => {
  const quote = artifactRevisionDraft(first, { agentId: 'agent-a', sessionId: 'session-a' });
  assert.ok(quote.includes(first.artifactId));
  assert.ok(quote.includes(first.sha256));
  assert.ok(quote.includes('来源会话："session-a"'));
  assert.ok(quote.includes(JSON.stringify(first.name)));
  assert.equal(appendArtifactRevisionDraft('原草稿', quote), `原草稿\n\n${quote}`);
  assert.equal(appendArtifactRevisionDraft('', quote), quote);
  assert.equal(appendArtifactRevisionDraft('原草稿', quote, 8), null, 'full draft cannot be overwritten or silently truncated');
});
