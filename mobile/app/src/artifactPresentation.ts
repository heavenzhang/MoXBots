import type { ArtifactDescriptor } from './native';

/** Content identifiers are not chronological versions or a filename-derived lineage. */
export function artifactContentLabel(artifact: ArtifactDescriptor): string {
  return `内容 ${artifact.sha256.slice(0, 12)}`;
}

export function sameArtifactDescriptor(left: ArtifactDescriptor, right: ArtifactDescriptor): boolean {
  return left.artifactId === right.artifactId && left.name === right.name && left.mimeType === right.mimeType
    && left.sizeBytes === right.sizeBytes && left.sha256 === right.sha256;
}

/** A repeated opaque ID is immutable, including when it crosses a pagination boundary. */
export function mergeArtifactPage(previous: readonly ArtifactDescriptor[], incoming: readonly ArtifactDescriptor[]): ArtifactDescriptor[] {
  const result = new Map(previous.map((item) => [item.artifactId, item]));
  for (const item of incoming) {
    const existing = result.get(item.artifactId);
    if (existing && !sameArtifactDescriptor(existing, item)) throw new Error('MOBILE_ARTIFACT_DESCRIPTOR_CHANGED');
    result.set(item.artifactId, item);
  }
  return [...result.values()];
}

/** Only references an actually listed immutable descriptor; it never creates a file or sends a message. */
export function artifactRevisionDraft(artifact: ArtifactDescriptor, source: { agentId: string; sessionId: string }): string {
  return [
    '请基于以下已交付成果继续修改：',
    `文件：${JSON.stringify(artifact.name)}`,
    `成果 ID：${artifact.artifactId}`,
    `内容 SHA-256：${artifact.sha256}`,
    `来源 Bot ID：${JSON.stringify(source.agentId)}`,
    `来源会话：${JSON.stringify(source.sessionId)}`,
    '修改要求：',
  ].join('\n');
}

/** Preserve an existing draft. A full composer stays unchanged instead of silently truncating either text. */
export function appendArtifactRevisionDraft(existing: string, reference: string, maxLength = 8000): string | null {
  const next = existing.length > 0 ? `${existing}\n\n${reference}` : reference;
  return next.length <= maxLength ? next : null;
}
