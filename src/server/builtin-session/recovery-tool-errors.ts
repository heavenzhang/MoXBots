import type { ProductTranscriptContent, ProductBlockTarget } from '../session-transcript/content';
import { recoveryActionHash } from '../openai-bridge/context-recovery';
import { projectTranscriptToolInput } from '../../shared/sessionTranscript';

export interface ReviewedToolError { toolUseId: string; toolName: string; actionHash: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Caller holds the existing Session mutation lock and signed review authority. */
export async function repairReviewedToolErrors(content: ProductTranscriptContent, evidence: readonly ReviewedToolError[], current: () => boolean): Promise<void> {
  if (!current()) throw new Error('recovery_review_owner_changed');
  const targets = new Map<string, ProductBlockTarget[]>();
  const remember = (id: unknown, target: ProductBlockTarget) => {
    if (typeof id === 'string') targets.set(id, [...(targets.get(id) ?? []), target]);
  };
  for (const message of content.writer.projection.messages.values()) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      const tool = block.tool;
      if (!object(tool)) continue;
      const target = { messageId: message.id, blockId: block.id };
      remember(tool.id, target);
      if (Array.isArray(tool.subagentCalls)) for (const call of tool.subagentCalls) {
        if (object(call) && typeof call.id === 'string') remember(call.id, { ...target, subagentToolId: call.id });
      }
    }
  }
  const updates: ProductBlockTarget[] = [];
  for (const proof of evidence) {
    const matches = targets.get(proof.toolUseId);
    if (matches?.length !== 1) throw new Error('recovery_review_product_tool_mismatch');
    const target = matches[0]!; const tool = content.readTool(target);
    if (!tool || tool.name !== proof.toolName) throw new Error('recovery_review_product_tool_mismatch');
    const input = projectTranscriptToolInput(tool).input;
    if (!object(input) || recoveryActionHash(tool.name as string, input) !== proof.actionHash) throw new Error('recovery_review_product_tool_mismatch');
    if (tool.isError !== true) updates.push(target);
  }
  for (const target of updates) content.updateTool(target, { isError: true }, true);
  if (!await content.writer.flushForMutation()) throw new Error('recovery_review_tool_error_save_failed');
  if (!current()) throw new Error('recovery_review_owner_changed');
}
