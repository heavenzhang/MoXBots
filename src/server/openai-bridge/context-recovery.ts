import { safeStreamFailure, streamFailure, streamFailureMessage, type StreamFailureDiagnostic } from './stream-failure-diagnostic';
import { createHash, randomUUID } from 'node:crypto';
import { NativeOperationJournal, type NativeOperationAttempt } from './native-operation-journal';
import type { AnthropicContentBlock, AnthropicMessage, AnthropicRequest, AnthropicToolResultBlock } from './types/anthropic';
import { readBoundedErrorBody } from './read-error-body';
import { SSEParser } from './utils/sse-parser';
import { hasModelStreamProgress, parseModelStreamEvent } from './utils/model-stream-event';
import { formatReplayBlockedStreamError, formatSSEFrame } from './utils/sse-writer';
import { ModelBodyIdleTimeoutError, ModelBodyReader } from './model-body-reader';
import { QueryRequestGuard } from './request-lifetime';
import type { StreamInterruptionCause, StreamInterruptionObserver } from './types/bridge';
import { StreamDeliveryWitness } from './stream-delivery-witness';
import { nativeActionDiagnostic, observeRecoveryDiagnostic, type NativeActionPhase, type RecoveryDiagnosticObserver } from './recovery-causal-diagnostics';

/** Internal, Query-local evidence capability. Never accepted from HTTP/model metadata. */
export interface SettledInterruptionReceipt {
  readonly id: string;
  readonly interruptedAt: number;
  readonly archive: string;
  isCurrent(): boolean;
}

export interface BridgeContextRecovery {
  run(request: Request, body: AnthropicRequest,
    execute: (projected: AnthropicRequest, onStreamInterruption?: StreamInterruptionObserver) => Promise<Response>): Promise<Response>;
}

export interface ContextRecoveryOptions {
  /** Internal diagnostics; never used as ledger/checkpoint/retry evidence. */
  onDiagnostic?: RecoveryDiagnosticObserver;
  scope: () => string | undefined;
  isActive: () => boolean;
  requestIdentity?: () => string;
  canRecover?: () => boolean;
  /** Arm the existing action ledger before exposing any streaming inference. */
  protectStreaming?: boolean | (() => boolean);
  backup: (body: AnthropicRequest, metadata: { digest: string; scope: string }) => Promise<string>;
  onRecovery?: (info: { digest: string; archive: string }) => void;
  /** Explicitly selected same-Goal recovery source, loaded by the existing persistence owner. */
  initialCheckpoint?: ContextRecoveryCheckpoint;
  initialLedger?: unknown;
  recoveryOwner?: { sessionId: string; sdkSessionId: string };
  persistLedger?: (ledger: unknown, stillCurrent?: () => boolean) => Promise<void>;
  archiveSettledInterruption?: (evidence: unknown, digest: string, scope: string, stillCurrent: () => boolean) => Promise<string>;
}

export interface ContextRecoveryCheckpoint {
  body: AnthropicRequest;
  archive: string;
  digest: string;
}

type Evidence = { result: unknown; digest?: string; archive?: string };
type NoDispatchEvidence = {
  sessionId: string; sdkSessionId: string; queryGeneration: number; scope: string;
  toolUseId: string; toolName: 'TaskGet' | 'Bash'; actionHash: string; reason: 'missing-taskId' | 'missing-command';
};
type NativeErrorEvidence = {
  sessionId: string; sdkSessionId: string; queryGeneration: number; scope: string;
  toolUseId: string; toolName: string; actionHash: string;
  reason: 'pre-tool-denied' | 'bash-exited'; resultDigest?: string; exitCode?: number;
};
type State = {
  reconciliationOnly?: boolean;
  scope: string;
  attempted: boolean;
  recovered: boolean;
  blocked: boolean;
  streamInterrupted: boolean;
  inFlight: Set<string>;
  recovering: boolean;
  delivered: Set<string>;
  completed: Map<string, Evidence>;
  uncertain: Set<string>;
  denied: Set<string>;
};
type Analysis = { completed: Map<string, Evidence>; uncertain: Set<string> };
type NativeEvidenceOwner = { sessionId: string; sdkSessionId: string; queryGeneration: number; isCurrent: () => boolean };

/** Tracks only tool calls observed in the current Query's live SDK stream. */
export class LiveQueryToolUseTracker {
  private readonly calls = new Map<string, { name: 'TaskGet' | 'Bash'; input: unknown; scope: string | undefined; materialized: boolean }>();

  observeStreamEvent(event: unknown, scope: string | undefined): void {
    if (!record(event) || event.type !== 'content_block_start' || !record(event.content_block)) return;
    const block = event.content_block;
    if (block.type !== 'tool_use' || typeof block.id !== 'string' || !block.id
      || (block.name !== 'TaskGet' && block.name !== 'Bash')) return;
    if (this.calls.size < MAX_LEDGER_ENTRIES || this.calls.has(block.id)) {
      this.calls.set(block.id, { name: block.name, input: block.input ?? {}, scope, materialized: false });
    }
  }

  materializeAssistantMessage(message: unknown): void {
    if (!record(message) || !Array.isArray(message.content)) return;
    for (const block of message.content) {
      if (!record(block) || block.type !== 'tool_use' || typeof block.id !== 'string') continue;
      const observed = this.calls.get(block.id);
      if (observed && observed.name === block.name && Object.hasOwn(block, 'input')) {
        this.calls.set(block.id, { ...observed, input: block.input, materialized: true });
      }
    }
  }

  takeErrorResult(block: unknown): { toolUseId: string; name: 'TaskGet' | 'Bash'; input: unknown; scope: string | undefined } | undefined {
    if (!record(block) || block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') return undefined;
    const observed = this.calls.get(block.tool_use_id);
    this.calls.delete(block.tool_use_id);
    if (!observed || !observed.materialized || block.is_error !== true) return undefined;
    return { toolUseId: block.tool_use_id, ...observed };
  }
}

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const TAIL_MESSAGES = 2;
const EXCERPT_CHARACTERS = 384;
const MAX_LEDGER_ENTRIES = 2048;

function canonical(value: unknown, ignoreCache = false): string {
  const encoded = JSON.stringify(value, (key, item: unknown) => {
    if (ignoreCache && key === 'cache_control') return undefined;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
  if (encoded === undefined) return 'null';
  return encoded;
}

function digest(value: unknown, ignoreCache = false): string {
  return createHash('sha256').update(canonical(value, ignoreCache)).digest('hex');
}

export function recoveryActionHash(name: string, input: unknown): string {
  return digest({ name, input });
}

/** Narrow native builtin contract: never classify shell/MCP/SQL text as read-only. */
export function isBuiltinTaskQuery(name: unknown, input: unknown): boolean {
  if (!record(input)) return false;
  const keys = Object.keys(input);
  if (name === 'TaskList') return keys.length === 0;
  // Missing taskId fails native validation; it still cannot mutate a task.
  return name === 'TaskGet' && keys.every(key => key === 'taskId')
    && (keys.length === 0 || typeof input.taskId === 'string' && input.taskId.length <= 512);
}

export interface ReadonlyTaskResolution {
  version: 1;
  kind: 'builtin-task-query-reviewed';
  sessionId: string;
  sdkSessionId: string;
  actionHash: string;
  toolName: 'TaskGet' | 'TaskList';
  input: Record<string, unknown>;
  sourceUseUuid: string;
  toolUseId: string;
  ledgerBeforeDigest: string;
  reviewedAt: string;
}

export function validReadonlyTaskResolution(value: unknown, owner?: { sessionId: string; sdkSessionId: string }): value is ReadonlyTaskResolution {
  if (!record(value) || value.version !== 1 || value.kind !== 'builtin-task-query-reviewed'
    || !owner || value.sessionId !== owner.sessionId || value.sdkSessionId !== owner.sdkSessionId
    || !isBuiltinTaskQuery(value.toolName, value.input)
    || value.actionHash !== recoveryActionHash(value.toolName as string, value.input)
    || typeof value.ledgerBeforeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.ledgerBeforeDigest)
    || typeof value.reviewedAt !== 'string' || !Number.isFinite(Date.parse(value.reviewedAt))) return false;
  return [value.toolUseId, value.sourceUseUuid].every(id => typeof id === 'string' && id.length > 0 && id.length <= 512);
}

function nativeErrorKey(actionHash: string, toolUseId: string): string {
  return digest({ kind: 'native-error', actionHash, toolUseId });
}

function nativeResultText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content) && content.length === 1 && record(content[0])
    && content[0].type === 'text' && typeof content[0].text === 'string') return content[0].text;
  return undefined;
}

function settledBashExit(error: unknown, interrupted: boolean | undefined): number | undefined {
  if (interrupted !== false || typeof error !== 'string') return undefined;
  // Native Bash prefixes a normal process failure with its exit status. Signals,
  // timeouts and arbitrary MCP/tool errors do not prove a settled shell process.
  const code = /^Exit code ([1-9][0-9]{0,2})(?:\r?\n|$)/.exec(error)?.[1];
  const exitCode = Number(code);
  return Number.isInteger(exitCode) && exitCode < 128 && exitCode !== 124 ? exitCode : undefined;
}

function noDispatchKey(actionHash: string, toolUseId: string): string {
  return digest({ kind: 'no-dispatch', actionHash, toolUseId });
}

function noDispatchSchemaReason(name: string, input: unknown): NoDispatchEvidence['reason'] | undefined {
  if (!record(input)) return undefined;
  if (name === 'TaskGet' && typeof input.taskId !== 'string') return 'missing-taskId';
  if (name === 'Bash' && typeof input.command !== 'string') return 'missing-command';
  return undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateImage(block: Record<string, unknown>): boolean {
  if (!record(block.source)) return false;
  return (block.source.type === 'base64' && typeof block.source.data === 'string')
    || (block.source.type === 'url' && typeof block.source.url === 'string');
}

/** Validate the whole history before omitting anything, including untouched tail blocks. */
function analyze(body: AnthropicRequest, denied: ReadonlySet<string>, proof: ReadonlyMap<string, Evidence>,
  noDispatch: ReadonlyMap<string, NoDispatchEvidence>, nativeErrors: ReadonlyMap<string, NativeErrorEvidence>, readonlyTasks: ReadonlyMap<string, ReadonlyTaskResolution>): Analysis | undefined {
  if (!Array.isArray(body.messages)) return undefined;
  const uses = new Map<string, { name: string; input: unknown; matched: boolean }>();
  const completed = new Map<string, Evidence>();
  const uncertain = new Set<string>();
  for (const message of body.messages) {
    if (!record(message)) return undefined;
    // SDK 0.3.296 emits internal system messages in the messages array as well
    // as the top-level system prompt. Preserve them verbatim; never omit instructions.
    const role: unknown = message.role;
    if (role === 'system') {
      if (typeof message.content === 'string') continue;
      if (Array.isArray(message.content) && message.content.every(block => record(block)
        && block.type === 'text' && typeof block.text === 'string')) continue;
      return undefined;
    }
    if (message.role !== 'user' && message.role !== 'assistant') return undefined;
    if (typeof message.content === 'string') continue;
    if (!Array.isArray(message.content)) return undefined;
    for (const block of message.content) {
      if (!record(block)) return undefined;
      switch (block.type) {
        case 'text':
          if (typeof block.text !== 'string') return undefined;
          break;
        case 'thinking':
          if (message.role !== 'assistant' || typeof block.thinking !== 'string'
            || (block.signature !== undefined && typeof block.signature !== 'string')) return undefined;
          break;
        case 'image':
          if (!validateImage(block)) return undefined;
          break;
        case 'tool_use': {
          if (message.role !== 'assistant' || typeof block.id !== 'string' || !block.id
            || typeof block.name !== 'string' || !block.name || !record(block.input) || uses.has(block.id)) return undefined;
          uses.set(block.id, { name: block.name, input: block.input, matched: false });
          break;
        }
        case 'tool_result': {
          if (message.role !== 'user' || typeof block.tool_use_id !== 'string'
            || (block.is_error !== undefined && typeof block.is_error !== 'boolean')) return undefined;
          const use = uses.get(block.tool_use_id);
          if (!use || use.matched) return undefined;
          use.matched = true;
          if (block.content !== undefined && typeof block.content !== 'string') {
            if (!Array.isArray(block.content)) return undefined;
            for (const content of block.content) {
              if (!record(content) || (content.type !== 'text' && content.type !== 'image')
                || (content.type === 'text' && typeof content.text !== 'string')
                || (content.type === 'image' && !validateImage(content))) return undefined;
            }
          }
          if (!READ_ONLY_TOOLS.has(use.name) && !readonlyTasks.has(recoveryActionHash(use.name, use.input))) {
            const key = recoveryActionHash(use.name, use.input);
            if (block.is_error) {
              const nativeError = nativeErrors.get(nativeErrorKey(key, block.tool_use_id));
              if (nativeError?.toolName === use.name && (nativeError.reason === 'pre-tool-denied'
                || nativeError.resultDigest === digest(nativeResultText(block.content)))) break;
              const noDispatchProof = noDispatch.get(noDispatchKey(key, block.tool_use_id));
              if (noDispatchProof && noDispatchProof.actionHash === key && noDispatchProof.toolUseId === block.tool_use_id
                && noDispatchProof.toolName === use.name && noDispatchSchemaReason(use.name, use.input) === noDispatchProof.reason) break;
              // A denial emitted by our own tool owner did not perform another action.
              // Accept only a key actually denied by this controller with archived prior
              // success; arbitrary tool errors mentioning the marker stay uncertain.
              if (!(denied.has(key) && proof.get(key)?.archive
                && canonical(block.content).includes('automatic_replay_blocked:'))) uncertain.add(key);
            }
            else completed.set(key, { result: block.content });
          }
          break;
        }
        default:
          return undefined;
      }
    }
  }
  if ([...uses.values()].some(use => !use.matched)) return undefined;
  return { completed, uncertain };
}

function excerpt(text: string): string {
  return text.length > EXCERPT_CHARACTERS * 2
    ? `${text.slice(0, EXCERPT_CHARACTERS)}\n[…]\n${text.slice(-EXCERPT_CHARACTERS)}`
    : text;
}

function omission(value: unknown, archive: string, kind: string, text = ''): string {
  return `[Context recovery: older ${kind} evidence omitted. Original SHA-256 ${digest(value)}; `
    + `archive ${JSON.stringify(archive)}. This is saved evidence, not a request to repeat any action.]`
    + (text ? `\n${excerpt(text)}` : '');
}

/** Preserve every user text constraint, system prompt, tool input/id and the newest two messages. */
function project(body: AnthropicRequest, archive: string): AnthropicRequest {
  const cutoff = Math.max(0, body.messages.length - TAIL_MESSAGES);
  const messages: AnthropicMessage[] = body.messages.map((message, index) => {
    if (index >= cutoff) return message;
    if (typeof message.content === 'string') {
      return message.role === 'assistant' && message.content.length > 4096
        ? { ...message, content: omission(message.content, archive, 'assistant', message.content) }
        : message;
    }
    const content = message.content.map((block): AnthropicContentBlock => {
      if (message.role === 'assistant' && block.type === 'text' && block.text.length > 4096) {
        return { ...block, text: omission(block.text, archive, 'assistant', block.text) };
      }
      if (block.type !== 'tool_result') return block;
      const result = block as AnthropicToolResultBlock;
      if (typeof result.content === 'string') {
        return result.content.length > 2048
          ? { ...result, content: omission(result.content, archive, 'tool result', result.content) }
          : result;
      }
      if (!result.content) return result;
      return { ...result, content: result.content.map(item => item.type === 'image'
        ? { type: 'text' as const, text: omission(item, archive, 'tool image') }
        : item.text.length > 2048
          ? { ...item, text: omission(item.text, archive, 'tool result', item.text) }
          : item) };
    });
    return { ...message, content };
  });
  return { ...body, messages };
}

function explicitlyOverflowed(text: string): boolean {
  let message = text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!record(parsed)) return false;
    const error = record(parsed.error) ? parsed.error : parsed;
    if (error.code === 'context_length_exceeded' || error.type === 'context_length_exceeded') return true;
    message = typeof error.message === 'string' ? error.message : '';
  } catch {
    // A bounded plain error is accepted only with an explicit context diagnosis.
    if (text.length > 1024) return false;
  }
  return /\bcontext window is full\b|\bmaximum context length\b|\bprompt (?:is )?too long\b/i.test(message);
}

function required(message: string, status = 409): Response {
  return new Response(JSON.stringify({ type: 'error', error: {
    type: 'invalid_request_error', code: 'context_recovery_required', message: `context_recovery_required: ${message}`,
  } }), { status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false',
    'x-moxbots-recovery': 'blocked' } });
}

function cancelled(): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', code: 'request_cancelled',
    message: 'Model request superseded or cancelled; progress was preserved.' } }), {
    status: 499, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  });
}

/** Only owner-authored reasons may cross the bridge; never forward arbitrary thrown text. */
class RecoveryPreparationError extends Error {
  constructor(readonly reason: string) { super(`context_recovery_required: ${reason}`); }
}

/** Owned by one existing Query. Only retries inference; never executes or re-enqueues a tool. */
export class ContextRecoveryController implements BridgeContextRecovery {
  private state: State | undefined;
  private projectionActive = false;
  private actionProtectionActive = false;
  private readonly requestGuard = new QueryRequestGuard(reason => observeRecoveryDiagnostic(
    { event: 'inference_admission_rejected', owner: 'context', reason }, this.options.onDiagnostic));
  private retiredScope: string | undefined;
  private readonly requestRetryFences = new Set<object>();
  private completedLedger = new Map<string, Evidence>();
  private noDispatchLedger = new Map<string, NoDispatchEvidence>();
  private nativeErrors = new Map<string, NativeErrorEvidence>();
  private readonly observedToolUseIds = new Set<string>();
  private nativeProofsDisabled = false;
  private nativeEvidenceOwner: NativeEvidenceOwner | undefined;
  private nativeQueryEpoch = randomUUID();
  private readonly operations = new NativeOperationJournal();
  private uncertainLedger = new Set<string>();
  private readonlyTasks = new Map<string, ReadonlyTaskResolution>();
  private deniedLedger = new Set<string>();
  private ledgerBlocked = false;
  // Write-ahead arming alone does not forbid intentional normal-turn repeats.
  private streamArmedOnly = false;
  private readonly retiredStreamFingerprints = new Set<string>();
  private persistenceTail: Promise<void> = Promise.resolve();
  private nativeRevision = 0;
  private unboundNativeAdmission = false;
  private readonly toolOwners = new Map<string, { scope: string | undefined; fingerprint: string; actionHash?: string }>();
  private readonly nativeAdmissions = new Map<string, { scope: string | undefined; pending: boolean; actionHash: string; owner?: NativeEvidenceOwner; queryEpoch: string; attempt?: NativeOperationAttempt }>();
  private settledReceipt: { receipt: SettledInterruptionReceipt; fingerprints: readonly string[] } | undefined;

  /** Redacted inspection only. This snapshot cannot grant recovery or settle actions. */
  inspectActionLedger() {
    return {
      completedCount: this.completedLedger.size,
      uncertainCount: this.uncertainLedger.size,
      blocked: this.ledgerBlocked,
      nativeErrorReceiptCount: this.nativeErrors.size,
      noDispatchReceiptCount: this.noDispatchLedger.size,
      readonlyTaskReceiptCount: this.readonlyTasks.size,
      operationAttempts: this.operations.inspect(),
      uncertainActions: [...this.uncertainLedger].sort().map(actionId => ({
        actionId, completedEvidenceAlsoPresent: this.completedLedger.has(actionId),
      })),
    };
  }

  /** Diagnostic only: never turns an ordinary error into a recovery candidate. */
  settledInterruptionFailure(): string | undefined {
    const state = this.current();
    if (!state || !this.requestGuard.hasInterruptedScope(state.scope)) return undefined;
    if (this.ledgerBlocked || this.uncertainLedger.size || state.uncertain.size) return 'history_uncertain';
    if (this.options.canRecover?.() === false) return 'background_unsettled';
    return 'live_proof_unavailable';
  }

  /** Called by the original native result owner only, after exact background settlement. */
  async prepareSettledInterruption(nativeStillCurrent: () => boolean): Promise<SettledInterruptionReceipt | undefined> {
    const state = this.current();
    const owner = this.nativeEvidenceOwner;
    if (!state || !owner?.isCurrent() || !this.options.archiveSettledInterruption
      || !this.options.persistLedger || !this.options.recoveryOwner || !nativeStillCurrent()
      || this.options.canRecover?.() === false || this.ledgerBlocked || this.nativeProofsDisabled
      || !this.actionProtectionActive || this.unboundNativeAdmission || this.uncertainLedger.size || state.uncertain.size
      || this.requestRetryFences.size) return undefined;
    const manifest = this.requestGuard.settledScope(state.scope);
    if (!manifest) return undefined;
    const native = [...this.nativeAdmissions].filter(([, admission]) => admission.scope === state.scope);
    if (native.some(([, admission]) => admission.pending)
      || manifest.toolUseIds.length !== native.length
      || manifest.toolUseIds.some(id => !this.nativeAdmissions.has(id))) return undefined;
    // This is an actual recovery, not normal-turn standby arming. Preserve
    // completed-action denial durably even if the engine exits before advance.
    this.streamArmedOnly = false;
    const nativeRevision = this.nativeRevision;
    const ledgerDigest = () => digest({ completed: [...this.completedLedger], uncertain: [...this.uncertainLedger], nativeErrors: [...this.nativeErrors], readonlyTasks: [...this.readonlyTasks], operations: this.operations.serialize(),
      denied: [...this.deniedLedger], noDispatch: [...this.noDispatchLedger], blocked: this.ledgerBlocked,
      projectionActive: this.projectionActive, streamArmedOnly: this.streamArmedOnly });
    const ledger = ledgerDigest();
    const live = () => this.options.isActive() && owner === this.nativeEvidenceOwner && owner.isCurrent()
      && nativeStillCurrent() && this.options.canRecover?.() !== false && this.options.scope() === state.scope
      && this.nativeRevision === nativeRevision && this.requestGuard.isCurrentSnapshot(manifest)
      && !this.ledgerBlocked && !this.uncertainLedger.size && !state.uncertain.size && ledgerDigest() === ledger;
    if (!live()) return undefined;
    await this.persist(live);
    if (!live()) return undefined;
    const evidence = { version: 1, kind: 'settled-stream-no-tool-dispatch', ...this.options.recoveryOwner,
      queryGeneration: owner.queryGeneration, scope: state.scope, manifest, nativeRevision, ledgerDigest: ledger };
    const id = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    const archive = await this.options.archiveSettledInterruption(evidence, id, state.scope, live);
    if (!live() || typeof archive !== 'string' || !archive.trim()) return undefined;
    const receipt = Object.freeze({ id, interruptedAt: manifest.interruptedAt, archive, isCurrent: live });
    this.settledReceipt = { receipt, fingerprints: manifest.fingerprints };
    return receipt;
  }

  constructor(private readonly options: ContextRecoveryOptions) {
    if (options.initialLedger !== undefined) this.restoreLedger(options.initialLedger);
    const checkpoint = options.initialCheckpoint;
    if (checkpoint) this.restoreCheckpoint(checkpoint.body, checkpoint.archive, checkpoint.digest);
  }

  // The Query still contains its original native history after a product turn ends.
  // Keep the projection and rescue ledger even after native compaction removes
  // old pairs. Foreground recovery state ends here; Query request replay evidence survives.
  // A deliberate new Query
  // starts unarmed unless its owner explicitly restores this same-Goal checkpoint.
  endTurn(continuingStream = false): void {
    if (!continuingStream) this.retiredStreamFingerprints.clear();
    this.retiredScope = this.state?.scope ?? this.options.scope();
    this.state = undefined;
  }

  async flushForReadonlyReview(): Promise<void> {
    await this.persistenceTail;
    if (this.ledgerBlocked || this.state?.inFlight.size || this.state?.recovering) {
      throw new Error('context_recovery_required: Recovery review is not idle');
    }
  }

  canAdoptReadonlyTaskResolution(receipt: ReadonlyTaskResolution): boolean {
    return validReadonlyTaskResolution(receipt, this.options.recoveryOwner) && !this.state?.inFlight.size
      && !this.state?.recovering && !this.ledgerBlocked && this.uncertainLedger.has(receipt.actionHash);
  }

  /** After an idle, CAS-protected Store commit only. Never resets any Query/Stop/retry fence. */
  adoptReadonlyTaskResolution(receipt: ReadonlyTaskResolution): void {
    if (!this.canAdoptReadonlyTaskResolution(receipt)) {
      throw new Error('context_recovery_required: Readonly review cannot be adopted');
    }
    this.readonlyTasks.set(receipt.actionHash, structuredClone(receipt));
    this.uncertainLedger.delete(receipt.actionHash);
    this.state?.uncertain.delete(receipt.actionHash);
    // reconciliationOnly is deliberately retained until an explicit fresh turn.
  }

  /** Used only for pre-delivery inference retries, never tool execution. */
  canRetryInference(): boolean {
    const state = this.current();
    return !this.requestGuard.isBlocked(state?.scope, !state || this.options.canRecover?.() === false)
      && this.requestRetryFences.size === 0 && !this.ledgerBlocked && !this.state?.blocked && this.uncertainLedger.size === 0
      && !this.state?.uncertain.size;
  }

  /** Rehydrate one or more archived sources without reading files or becoming a storage owner. */
  restoreCheckpoint(body: AnthropicRequest, archive: string, sourceDigest: string): void {
    if (this.state?.inFlight.size) throw new Error('context_recovery_required: Cannot restore during active inference.');
    this.projectionActive = true;
    this.actionProtectionActive = true;
    const analysis = analyze(body, this.deniedLedger, this.completedLedger, this.noDispatchLedger, this.nativeErrors, this.readonlyTasks);
    if (!analysis || typeof archive !== 'string' || !archive.trim() || archive.length > 4096 || /[\r\n]/.test(archive)
      || createHash('sha256').update(JSON.stringify(body)).digest('hex') !== sourceDigest) {
      this.ledgerBlocked = true;
      throw new Error('context_recovery_required: Recovery checkpoint integrity or tool history validation failed.');
    }
    const completed = new Map([...analysis.completed].map(([key, value]) => [key, { ...value, archive, digest: sourceDigest }]));
    if (!this.mergeLedger(completed, analysis.uncertain)) {
      throw new Error('context_recovery_required: Recovery ledger capacity exceeded.');
    }
    this.state = undefined;
  }

  /** Archive and protect this inference's completed actions without reducing native history. */
  async protectInference(body: AnthropicRequest, prearm = false): Promise<void> {
    const state = this.current();
    if (!state || this.options.canRecover?.() === false || this.requestGuard.inFlightCount > 1
      || this.ledgerBlocked || state.blocked || this.requestGuard.isBlocked(state.scope)) {
      throw new RecoveryPreparationError('The inference has no exclusive recovery authority.');
    }
    const analysis = analyze(body, this.deniedLedger, this.completedLedger, this.noDispatchLedger, this.nativeErrors, this.readonlyTasks);
    const safeHistory = !!analysis && analysis.uncertain.size === 0 && state.uncertain.size === 0;
    if (prearm && (!safeHistory || !this.canRetryInference()) && !state.attempted && !this.projectionActive) {
      // An explicit ordinary inference is not recovery. Legacy failed/unpaired
      // history must not create a new 409 before that input reaches the model.
      // A restored strict ledger must also permit inspection. Preserve its
      // completed/uncertain evidence and restrict this turn to native read tools;
      // this inference grants neither action nor automatic recovery authority.
      if (analysis) {
        const completed = new Map([...analysis.completed].map(([key, evidence]) =>
          [key, this.completedLedger.get(key) ?? evidence]));
        if (!this.mergeLedger(completed, analysis.uncertain)) throw new RecoveryPreparationError('Action ledger capacity exceeded.');
        for (const key of analysis.uncertain) state.uncertain.add(key);
      }
      state.reconciliationOnly = true;
      this.streamArmedOnly = !this.actionProtectionActive || this.streamArmedOnly;
      this.actionProtectionActive = true;
      await this.persist();
      if (this.current() !== state || this.options.canRecover?.() === false) {
        throw new RecoveryPreparationError('The read-only reconciliation owner changed during ledger persistence.');
      }
      return;
    }
    if (!this.canRetryInference() || !safeHistory || !analysis) {
      throw new RecoveryPreparationError('An earlier tool outcome requires read-only reconciliation.');
    }
    const sourceDigest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    let archive: string;
    try { archive = await this.options.backup(body, { digest: sourceDigest, scope: state.scope }); }
    catch { throw new RecoveryPreparationError('The original history could not be durably archived; business actions stopped.'); }
    if (this.current() !== state || !this.options.isActive() || this.options.canRecover?.() === false) {
      throw new RecoveryPreparationError('The recovery owner changed during archival.');
    }
    const completed = new Map([...analysis.completed].map(([key, value]) => [key, { ...value, archive, digest: sourceDigest }]));
    if (!this.mergeLedger(completed, analysis.uncertain)) throw new RecoveryPreparationError('Action ledger capacity exceeded.');
    for (const [key, value] of completed) state.completed.set(key, value);
    this.streamArmedOnly = prearm && (!this.actionProtectionActive || this.streamArmedOnly);
    this.actionProtectionActive = true;
    await this.persist();
  }

  /** Retire only a fully settled failed stream after its owner verifies native continuation. */
  prepareStreamContinuation(body: AnthropicRequest): number {
    const state = this.current();
    const settled = this.settledReceipt?.receipt.isCurrent() ? this.settledReceipt : undefined;
    if (!state || ((!state.blocked || !state.streamInterrupted) && !settled) || !this.actionProtectionActive
      || this.options.canRecover?.() === false || this.requestGuard.inFlightCount !== 0
      || state.inFlight.size !== 0 || this.requestRetryFences.size !== 0
      || this.ledgerBlocked || this.uncertainLedger.size !== 0 || state.uncertain.size !== 0) {
      throw new Error('automatic_replay_blocked: The failed stream has no safe continuation authority.');
    }
    const analysis = analyze(body, this.deniedLedger, this.completedLedger, this.noDispatchLedger, this.nativeErrors, this.readonlyTasks);
    if (!analysis || analysis.uncertain.size !== 0) {
      throw new Error('automatic_replay_blocked: Native continuation contains unknown or uncertain tool outcomes.');
    }
    const completed = new Map([...analysis.completed].map(([key, evidence]) =>
      [key, this.completedLedger.get(key) ?? evidence]));
    if (!this.mergeLedger(completed, analysis.uncertain)) {
      throw new Error('automatic_replay_blocked: Continuation action ledger capacity is exhausted.');
    }
    const count = this.completedLedger.size;
    // Do not delete any admission evidence. Only a separately verified new
    // namespace can proceed; old native retries remain permanently fenced.
    if (this.retiredStreamFingerprints.size + state.delivered.size + (settled?.fingerprints.length ?? 0) > 4096) {
      throw new Error('automatic_replay_blocked: Stream continuation admission capacity exceeded.');
    }
    for (const fingerprint of state.delivered) this.retiredStreamFingerprints.add(fingerprint);
    for (const fingerprint of settled?.fingerprints ?? []) this.retiredStreamFingerprints.add(fingerprint);
    this.settledReceipt = undefined;
    this.streamArmedOnly = false;
    this.endTurn(true);
    return count;
  }

  private restoreLedger(value: unknown): void {
    this.actionProtectionActive = true;
    if (!record(value) || value.version !== 1 || !Array.isArray(value.completed)
      || !Array.isArray(value.uncertain) || !Array.isArray(value.denied)
      || typeof value.blocked !== 'boolean') throw new Error('context_recovery_required: Invalid recovery ledger');
    const validKey = (key: unknown): key is string => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
    if (value.completed.length + value.uncertain.length + (Array.isArray(value.noDispatch) ? value.noDispatch.length : 0)
        + (Array.isArray(value.nativeErrors) ? value.nativeErrors.length : 0) > MAX_LEDGER_ENTRIES
      || value.denied.length > MAX_LEDGER_ENTRIES
      || !value.uncertain.every(validKey) || !value.denied.every(validKey)
      || !value.completed.every(item => Array.isArray(item) && item.length === 2 && validKey(item[0]) && record(item[1]))) {
      throw new Error('context_recovery_required: Corrupt recovery ledger');
    }
    if (value.noDispatch !== undefined && (!Array.isArray(value.noDispatch) || !value.noDispatch.every(item =>
      Array.isArray(item) && item.length === 2 && validKey(item[0]) && record(item[1])
      && typeof item[1].actionHash === 'string' && validKey(item[1].actionHash)
      && typeof item[1].sessionId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(item[1].sessionId)
      && typeof item[1].sdkSessionId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(item[1].sdkSessionId)
      && Number.isSafeInteger(item[1].queryGeneration) && (item[1].queryGeneration as number) >= 0
      && typeof item[1].scope === 'string' && item[1].scope.length > 0 && item[1].scope.length <= 512
      && typeof item[1].toolUseId === 'string' && item[1].toolUseId.length > 0 && item[1].toolUseId.length <= 512
      && item[0] === noDispatchKey(item[1].actionHash, item[1].toolUseId)
      && (item[1].toolName === 'TaskGet' || item[1].toolName === 'Bash')
      && ((item[1].toolName === 'TaskGet' && item[1].reason === 'missing-taskId')
        || (item[1].toolName === 'Bash' && item[1].reason === 'missing-command'))))) {
      throw new Error('context_recovery_required: Corrupt no-dispatch evidence');
    }
    if (Array.isArray(value.noDispatch)
      && new Set(value.noDispatch.map((item: unknown) => Array.isArray(item) ? item[0] : undefined)).size !== value.noDispatch.length) {
      throw new Error('context_recovery_required: Duplicate no-dispatch evidence');
    }
    if (Array.isArray(value.noDispatch) && value.noDispatch.length > 0) {
      const expected = this.options.recoveryOwner;
      if (!expected || value.noDispatch.some((item: unknown) => !Array.isArray(item) || !record(item[1])
        || item[1].sessionId !== expected.sessionId || item[1].sdkSessionId !== expected.sdkSessionId)) {
        throw new Error('context_recovery_required: No-dispatch evidence owner mismatch');
      }
    }
    if (value.nativeErrors !== undefined) {
      const expected = this.options.recoveryOwner;
      if (!Array.isArray(value.nativeErrors) || !value.nativeErrors.every(item =>
        Array.isArray(item) && item.length === 2 && validKey(item[0]) && record(item[1])
        && expected && item[1].sessionId === expected.sessionId && item[1].sdkSessionId === expected.sdkSessionId
        && Number.isSafeInteger(item[1].queryGeneration) && (item[1].queryGeneration as number) >= 0
        && typeof item[1].scope === 'string' && item[1].scope.length > 0 && item[1].scope.length <= 512
        && typeof item[1].toolUseId === 'string' && item[1].toolUseId.length > 0 && item[1].toolUseId.length <= 512
        && typeof item[1].toolName === 'string' && item[1].toolName.length > 0 && item[1].toolName.length <= 512
        && validKey(item[1].actionHash) && item[0] === nativeErrorKey(item[1].actionHash, item[1].toolUseId)
        && (item[1].reason === 'pre-tool-denied'
          || (item[1].reason === 'bash-exited' && item[1].toolName === 'Bash' && validKey(item[1].resultDigest)
            && Number.isInteger(item[1].exitCode) && (item[1].exitCode as number) > 0
            && (item[1].exitCode as number) < 128 && item[1].exitCode !== 124)))
        || new Set(value.nativeErrors.map((item: unknown) => Array.isArray(item) ? item[0] : undefined)).size !== value.nativeErrors.length) {
        throw new Error('context_recovery_required: Native error evidence is corrupt or belongs to another history');
      }
      this.nativeErrors = new Map(value.nativeErrors as [string, NativeErrorEvidence][]);
    }
    if (value.projectionActive !== undefined && typeof value.projectionActive !== 'boolean') {
      throw new Error('context_recovery_required: Invalid recovery projection marker');
    }
    this.projectionActive = value.projectionActive !== false;
    this.completedLedger = new Map(value.completed as [string, Evidence][]);
    this.noDispatchLedger = new Map((value.noDispatch ?? []) as [string, NoDispatchEvidence][]);
    if (value.readonlyTasks !== undefined) {
      if (!Array.isArray(value.readonlyTasks) || value.readonlyTasks.length > MAX_LEDGER_ENTRIES
        || !value.readonlyTasks.every(item => validReadonlyTaskResolution(item, this.options.recoveryOwner)
          && (value.uncertain as string[]).includes(item.actionHash))
        || new Set(value.readonlyTasks.map(item => item.actionHash)).size !== value.readonlyTasks.length) {
        throw new Error('context_recovery_required: Invalid readonly task receipts');
      }
      this.readonlyTasks = new Map(value.readonlyTasks.map(item => [item.actionHash, item]));
    }
    this.uncertainLedger = new Set((value.uncertain as string[]).filter(key => !this.readonlyTasks.has(key)));
    this.operations.restore(value.operationAttempts, this.options.recoveryOwner, new Set(value.uncertain as string[]), new Set(this.readonlyTasks.keys()));
    this.deniedLedger = new Set(value.denied as string[]);
    if (value.streamArmedOnly !== undefined && typeof value.streamArmedOnly !== 'boolean') throw new Error('context_recovery_required: Invalid stream protection marker');
    this.streamArmedOnly = value.streamArmedOnly === true;
    this.ledgerBlocked = value.blocked;
  }

  private async persist(stillCurrent?: () => boolean): Promise<void> {
    if (!this.actionProtectionActive || !this.options.persistLedger) return;
    const commit = this.persistenceTail.then(async () => {
      if (this.ledgerBlocked) throw new Error('Recovery ledger is blocked');
      if (stillCurrent && !stillCurrent()) throw new Error('Recovery owner changed before evidence commit');
      await this.options.persistLedger!({ version: 1, completed: [...this.completedLedger],
        uncertain: [...new Set([...this.uncertainLedger, ...this.readonlyTasks.keys()])], denied: [...this.deniedLedger], blocked: this.ledgerBlocked,
        projectionActive: this.projectionActive, streamArmedOnly: this.streamArmedOnly,
        noDispatch: [...this.noDispatchLedger], nativeErrors: [...this.nativeErrors],
        ...(this.readonlyTasks.size ? { readonlyTasks: [...this.readonlyTasks.values()] } : {}),
        ...(this.options.recoveryOwner ? { operationAttempts: this.operations.serialize() } : {}) }, stillCurrent);
    });
    this.persistenceTail = commit.catch(() => { this.ledgerBlocked = true; });
    try { await commit; }
    catch {
      this.ledgerBlocked = true;
      throw new RecoveryPreparationError('Recovery ledger could not be committed; business actions stopped.');
    }
  }

  /** Bind SDK-native no-dispatch evidence to one live Query and durable Session owner. */
  bindNoDispatchOwner(owner: { sessionId: string; sdkSessionId: string; queryGeneration: number; isCurrent: () => boolean }): void {
    if (!this.options.persistLedger || !owner.sessionId || !owner.sdkSessionId
      || !Number.isSafeInteger(owner.queryGeneration) || owner.queryGeneration < 0 || !owner.isCurrent()
      || this.options.recoveryOwner?.sessionId !== owner.sessionId || this.options.recoveryOwner?.sdkSessionId !== owner.sdkSessionId) {
      throw new Error('context_recovery_required: Invalid no-dispatch owner');
    }
    this.nativeEvidenceOwner = owner;
    this.nativeQueryEpoch = randomUUID();
    this.observedToolUseIds.clear();
    this.nativeProofsDisabled = false;
  }

  snapshotNoDispatchScope(): string | undefined {
    return this.options.scope();
  }

  private traceNativeAction(phase: NativeActionPhase, toolUseId?: string, actionHash?: string, failed?: boolean): void {
    try {
      observeRecoveryDiagnostic(nativeActionDiagnostic(phase, toolUseId, actionHash,
        this.actionProtectionActive && !!this.options.persistLedger, failed), this.options.onDiagnostic);
    } catch { /* Digest/log failures cannot change the original hook outcome. */ }
  }

  private recordNativeError(name: string, input: unknown, toolUseId: string | undefined,
    reason: NativeErrorEvidence['reason'], result?: unknown, exitCode?: number): boolean {
    const owner = this.nativeEvidenceOwner;
    const scope = this.options.scope();
    const admission = toolUseId ? this.nativeAdmissions.get(toolUseId) : undefined;
    const emission = toolUseId ? this.toolOwners.get(toolUseId) : undefined;
    const key = recoveryActionHash(name, input);
    // Outcome recording belongs to the exact live tool admission. Background work
    // can revoke inference retry/continuation without invalidating this receipt.
    // Requiring canRecover here turns known exits/denials into durable unknowns.
    if (!owner?.isCurrent() || !toolUseId || !scope || !this.options.isActive()
      || this.ledgerBlocked || this.nativeProofsDisabled || !admission?.pending
      || admission.actionHash !== key || admission.scope !== scope || emission?.scope !== scope || emission.actionHash !== key
      || admission.owner !== owner || admission.queryEpoch !== this.nativeQueryEpoch
      || (reason === 'bash-exited' && !admission.attempt)) return false;
    const proofKey = nativeErrorKey(key, toolUseId);
    if (!this.nativeErrors.has(proofKey) && this.ledgerEntryCount() >= MAX_LEDGER_ENTRIES) return false;
    this.nativeErrors.set(proofKey, { sessionId: owner.sessionId, sdkSessionId: owner.sdkSessionId,
      queryGeneration: owner.queryGeneration, scope, toolUseId, toolName: name, actionHash: key, reason,
      ...(reason === 'bash-exited' ? { resultDigest: digest(result), exitCode } : {}) });
    this.actionProtectionActive = true;
    return true;
  }

  /** Reserve before invoking a mutating tool: a crash leaves an uncertain action, never a replay. */
  async authorizeTool(name: string, input: unknown, toolUseId?: string): Promise<string | undefined> {
    this.traceNativeAction('reserve_enter', toolUseId, toolUseId ? this.toolOwners.get(toolUseId)?.actionHash : undefined);
    this.nativeRevision++;
    const emission = toolUseId ? this.toolOwners.get(toolUseId) : undefined;
    if (!toolUseId || !emission || emission.actionHash !== recoveryActionHash(name, input) || this.nativeAdmissions.has(toolUseId) || this.nativeAdmissions.size >= MAX_LEDGER_ENTRIES) this.unboundNativeAdmission = true;
    else this.nativeAdmissions.set(toolUseId, { scope: emission.scope, pending: true, actionHash: emission.actionHash!, owner: this.nativeEvidenceOwner, queryEpoch: this.nativeQueryEpoch });
    if (toolUseId) {
      if (this.observedToolUseIds.size >= MAX_LEDGER_ENTRIES) this.nativeProofsDisabled = true;
      else this.observedToolUseIds.add(toolUseId);
    }
    const denied = this.beforeTool(name, input);
    if (denied) {
      if (this.recordNativeError(name, input, toolUseId, 'pre-tool-denied')) {
        this.nativeAdmissions.get(toolUseId!)!.pending = false;
      }
      try { await this.persist(); } catch { /* execution is already denied */ }
      this.traceNativeAction('reserve_denied', toolUseId, emission?.actionHash);
      return denied;
    }
    if (READ_ONLY_TOOLS.has(name) || this.readonlyTasks.has(recoveryActionHash(name, input)) || !this.actionProtectionActive) {
      this.traceNativeAction('reserve_not_required', toolUseId, emission?.actionHash);
      return undefined;
    }
    const state = this.toolState();
    if (!state) {
      this.traceNativeAction('reserve_denied', toolUseId, emission?.actionHash);
      return 'automatic_replay_blocked: Recovery Query is no longer current.';
    }
    const key = recoveryActionHash(name, input);
    const owner = this.nativeEvidenceOwner;
    const scope = this.options.scope();
    if (owner?.isCurrent() && toolUseId && this.options.isActive() && !this.nativeProofsDisabled) {
      // PreToolUse is itself a native admission source. Missing bridge emission
      // still fences stream continuation; it need not erase a genuine tool receipt.
      const admission = this.nativeAdmissions.get(toolUseId);
      if (this.operations.hasToolId(toolUseId) || admission?.attempt) {
        return 'automatic_replay_blocked: This native tool identity was already reserved; it cannot execute twice.';
      }
      if (this.uncertainLedger.has(key) && !this.operations.hasUnresolved(key)) this.operations.markLegacy(key);
      try {
        const attempt = this.operations.reserve({ sessionId: owner.sessionId, sdkSessionId: owner.sdkSessionId,
          queryEpoch: this.nativeQueryEpoch, queryGeneration: owner.queryGeneration, scope: scope ?? `native-query:${this.nativeQueryEpoch}`, toolUseId, toolName: name, actionHash: key });
        this.nativeAdmissions.set(toolUseId, { scope, pending: true, actionHash: key, owner, queryEpoch: this.nativeQueryEpoch, attempt });
      } catch { return 'automatic_replay_blocked: Native operation reservation identity or capacity is unavailable.'; }
    } else this.operations.markLegacy(key);
    state.uncertain.add(key);
    this.uncertainLedger.add(key);
    const reservationLive = () => this.options.isActive() && this.options.scope() === scope
      && (!owner || this.nativeEvidenceOwner === owner && owner.isCurrent());
    try { await this.persist(reservationLive); }
    catch {
      this.traceNativeAction('reserve_failed', toolUseId, key);
      return 'automatic_replay_blocked: Could not durably reserve this action; execution stopped.';
    }
    const active = reservationLive();
    this.traceNativeAction(active ? 'reserve_complete' : 'reserve_denied', toolUseId, key);
    return active ? undefined : 'automatic_replay_blocked: Recovery turn was cancelled.';
  }

  async commitToolResult(name: string, input: unknown, result: unknown, failed = false, toolUseId?: string,
    nativeFailure?: { interrupted: boolean | undefined }): Promise<void> {
    const key = recoveryActionHash(name, input);
    const admission = toolUseId ? this.nativeAdmissions.get(toolUseId) : undefined;
    const owner = this.nativeEvidenceOwner;
    const scope = this.options.scope();
    const live = () => this.options.isActive() && !!owner?.isCurrent() && this.nativeEvidenceOwner === owner
      && this.options.scope() === scope && admission?.owner === owner && admission.queryEpoch === this.nativeQueryEpoch
      && admission.scope === scope && admission.actionHash === key;
    this.traceNativeAction('commit_enter', toolUseId, key, failed);
    try {
      this.nativeRevision++;
      const denied = failed && toolUseId && this.nativeErrors.has(nativeErrorKey(key, toolUseId));
      if ((READ_ONLY_TOOLS.has(name) || this.readonlyTasks.has(key) || denied) && live()) {
        if (admission) admission.pending = false;
        return;
      }
      // No result may consume a different, missing, terminal or retired admission.
      // An unbound error remains a conservative lead; an unbound success is not evidence.
      if (!live() || !admission?.pending || !admission.attempt || admission.attempt.status !== 'reserved') {
        if (failed && !denied && !admission?.attempt) this.recordToolResult(name, input, result, true);
        if (failed && !admission?.attempt) await this.persist();
        this.unboundNativeAdmission = true;
        return;
      }
      const attempt = admission.attempt;
      const exitCode = failed && name === 'Bash' ? settledBashExit(result, nativeFailure?.interrupted) : undefined;
      const settledExit = exitCode !== undefined && this.recordNativeError(name, input, toolUseId, 'bash-exited', result, exitCode);
      this.operations.complete(attempt, !failed ? 'success' : settledExit ? 'bash-exit' : 'error', digest(result));
      if (!failed) {
        this.recordToolResult(name, input, result);
        const evidence = this.completedLedger.get(key);
        if (evidence && !evidence.archive) evidence.archive = 'durable SessionStore action ledger';
      }
      if (!this.operations.isUncertain(key)) {
        this.uncertainLedger.delete(key);
        this.current()?.uncertain.delete(key);
      }
      await this.persist(live);
      if (!live()) {
        this.ledgerBlocked = true;
        throw new RecoveryPreparationError('Native result settlement owner changed during persistence.');
      }
      admission.pending = false;
      this.nativeRevision++;
      this.traceNativeAction('commit_complete', toolUseId, key, failed);
    } catch (error) {
      this.traceNativeAction('commit_failed', toolUseId, key, failed);
      throw error;
    }
  }

  /**
   * Clear uncertainty only for a schema failure the SDK produced before its
   * PreToolUse owner hook. Caller supplies the paired native tool-use ID, not
   * an error-message claim; actual admitted tool IDs always remain uncertain.
   */
  async commitNoDispatchValidationFailure(name: string, input: unknown, toolUseId: string, sourceScope: string): Promise<boolean> {
    const owner = this.nativeEvidenceOwner;
    if (!owner || this.nativeProofsDisabled || !toolUseId || this.observedToolUseIds.has(toolUseId)
      || !this.options.isActive() || !owner.isCurrent()) return false;
    if (!record(input)) return false;
    const reason = noDispatchSchemaReason(name, input);
    if (!reason) return false;
    const scope = this.options.scope();
    if (!scope || !sourceScope || sourceScope !== scope) return false;
    const key = recoveryActionHash(name, input);
    const proofKey = noDispatchKey(key, toolUseId);
    if (!this.noDispatchLedger.has(proofKey)
      && this.ledgerEntryCount() >= MAX_LEDGER_ENTRIES) return false;
    const evidence: NoDispatchEvidence = { sessionId: owner.sessionId, sdkSessionId: owner.sdkSessionId,
      queryGeneration: owner.queryGeneration, scope, toolUseId, toolName: name as 'TaskGet' | 'Bash', actionHash: key, reason };
    const prior = this.noDispatchLedger.get(proofKey);
    this.noDispatchLedger.set(proofKey, evidence);
    // A new proof settles only this newly observed malformed call. It cannot
    // erase an older/admitted unknown outcome sharing the same action hash.
    this.actionProtectionActive = true;
    try {
      await this.persist(() => owner.isCurrent() && this.nativeEvidenceOwner === owner
        && this.options.isActive() && this.options.scope() === scope);
      return true;
    } catch {
      if (prior) this.noDispatchLedger.set(proofKey, prior); else this.noDispatchLedger.delete(proofKey);
      return false;
    }
  }

  private mergeLedger(completed: ReadonlyMap<string, Evidence>, uncertain: ReadonlySet<string>): boolean {
    const completedKeys = new Set([...this.completedLedger.keys(), ...completed.keys()]);
    const uncertainKeys = new Set([...this.uncertainLedger, ...uncertain, ...this.readonlyTasks.keys()]);
    if (completedKeys.size + uncertainKeys.size + this.noDispatchLedger.size + this.nativeErrors.size > MAX_LEDGER_ENTRIES) {
      this.ledgerBlocked = true; return false;
    }
    for (const [key, value] of completed) this.completedLedger.set(key, value);
    for (const key of uncertain) if (!this.readonlyTasks.has(key)) this.uncertainLedger.add(key);
    for (const key of uncertain) if (!this.readonlyTasks.has(key)) this.operations.markLegacy(key);
    return true;
  }

  private ledgerEntryCount(): number {
    return this.completedLedger.size + this.uncertainLedger.size + this.readonlyTasks.size + this.noDispatchLedger.size + this.nativeErrors.size;
  }

  private current(): State | undefined {
    const scope = this.options.scope();
    if (!scope || scope === this.retiredScope || !this.options.isActive()) return undefined;
    if (this.state?.scope !== scope) this.state = {
      scope, attempted: this.projectionActive, recovered: this.projectionActive, blocked: this.ledgerBlocked, streamInterrupted: false,
      inFlight: new Set(), recovering: false, delivered: new Set(), completed: new Map(this.completedLedger),
      uncertain: new Set(this.uncertainLedger), denied: new Set(this.deniedLedger),
    };
    return this.state;
  }

  private toolState(): State | undefined {
    const state = this.current();
    if (state) return state;
    if (!this.options.isActive()) return undefined;
    return { scope: '', attempted: this.projectionActive, recovered: this.projectionActive,
      blocked: this.ledgerBlocked, streamInterrupted: false, inFlight: new Set(), recovering: false, delivered: new Set(),
      completed: new Map(this.completedLedger), uncertain: new Set(this.uncertainLedger), denied: new Set(this.deniedLedger) };
  }

  beforeTool(name: string, input: unknown): string | undefined {
    if (READ_ONLY_TOOLS.has(name) || this.readonlyTasks.has(recoveryActionHash(name, input))) return undefined;
    const state = this.toolState();
    if (!state) return this.actionProtectionActive || this.ledgerBlocked
      ? 'automatic_replay_blocked: Context recovery belongs to a retired or unbound turn; this action cannot run.' : undefined;
    let gate: 'state_blocked' | 'ledger_blocked' | 'request_guard_blocked' | undefined;
    if (state.blocked) gate = 'state_blocked';
    else if (this.ledgerBlocked) gate = 'ledger_blocked';
    else if (this.requestGuard.isBlocked(this.current()?.scope,
      !this.current() || this.options.canRecover?.() === false)) gate = 'request_guard_blocked';
    if (gate) {
      observeRecoveryDiagnostic({ event: 'native_action_gate_rejected', reason: gate }, this.options.onDiagnostic);
      return 'automatic_replay_blocked: Context recovery stopped with preserved progress. Business actions are blocked until recovery is resolved.';
    }
    if (state.reconciliationOnly) {
      return 'automatic_replay_blocked: An earlier tool outcome is uncertain. Only Read, Grep and Glob are allowed for read-only reconciliation; business actions remain blocked.';
    }
    if (!state.attempted && (!this.actionProtectionActive || this.streamArmedOnly)) return undefined;
    const key = recoveryActionHash(name, input);
    if (state.uncertain.has(key)) return 'automatic_replay_blocked: The earlier action has an uncertain outcome. Automatic repetition is blocked; verify it read-only.';
    if ([...this.nativeErrors.values()].some(item => item.reason === 'bash-exited' && item.actionHash === key)) {
      return 'automatic_replay_blocked: The earlier command exited with an error. Preserve its output and use a corrected command; automatic repetition is blocked.';
    }
    const evidence = state.completed.get(key);
    if (!evidence) return this.ledgerEntryCount() >= MAX_LEDGER_ENTRIES
      ? 'automatic_replay_blocked: Recovery ledger capacity is exhausted; another business action cannot be safely recorded.' : undefined;
    state.denied.add(key);
    this.deniedLedger.add(key);
    return `automatic_replay_blocked: This exact action already completed successfully; do not execute it again. Prior evidence: `
      + `${excerpt(canonical(evidence.result))}. Archive: ${evidence.archive ?? 'pending durable evidence'}; `
      + `request SHA-256: ${evidence.digest ?? 'recorded by the current tool owner'}.`;
  }

  recordToolResult(name: string, input: unknown, result: unknown, failed = false): void {
    if (READ_ONLY_TOOLS.has(name) || this.readonlyTasks.has(recoveryActionHash(name, input)) || !this.options.isActive()) return;
    // Background outcomes remain Query evidence after their parent foreground ends.
    const state = this.toolState();
    if (!state) return;
    const key = recoveryActionHash(name, input);
    if (failed) {
      if (!(state.denied.has(key) && state.completed.get(key)?.archive
        && canonical(result).includes('automatic_replay_blocked:'))) {
        state.uncertain.add(key);
        if (!this.mergeLedger(new Map(), new Set([key]))) state.blocked = true;
      }
    }
    else {
      const evidence = { ...state.completed.get(key), result };
      state.completed.set(key, evidence);
      if (this.actionProtectionActive && !this.mergeLedger(new Map([[key, evidence]]), new Set())) state.blocked = true;
    }
  }

  async run(request: Request, body: AnthropicRequest,
    execute: (projected: AnthropicRequest, onStreamInterruption?: StreamInterruptionObserver) => Promise<Response>): Promise<Response> {
    const requestIdentity = this.options.requestIdentity?.();
    const queryLive = () => !request.signal.aborted && this.options.isActive()
      && this.options.requestIdentity?.() === requestIdentity;
    if (!queryLive()) return cancelled();
    if (this.ledgerBlocked) return required('Recovery ledger integrity or capacity requires explicit resolution.');
    const currentState = this.current();
    // Background requests use their original body and the Query-owned safety ledger.
    // They never inherit a foreground projection or acquire a fresh recovery budget.
    const recoveryOwner = currentState && this.options.canRecover?.() !== false ? currentState : undefined;
    const state: State = recoveryOwner ?? {
      scope: '', attempted: false, recovered: false, blocked: false, streamInterrupted: false, inFlight: new Set(),
      recovering: false, delivered: new Set(), completed: new Map(this.completedLedger),
      uncertain: new Set(this.uncertainLedger), denied: new Set(this.deniedLedger),
    };
    const recoveryLive = () => queryLive() && !!recoveryOwner && this.state === state && this.options.scope() === state.scope;
    const live = queryLive;
    let fingerprint: string;
    let originalDigest: string;
    try {
      fingerprint = digest({ model: body.model, system: body.system, messages: body.messages, tools: body.tools }, true);
      originalDigest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    }
    catch { return required('Request history cannot be safely fingerprinted.'); }
    if (this.retiredStreamFingerprints.has(fingerprint)) {
      return required('This inference belongs to an interrupted attempt. Only the new verified continuation may proceed.');
    }
    const ambiguous = !currentState || this.options.canRecover?.() === false;
    const lease = this.requestGuard.begin(currentState?.scope, fingerprint, ambiguous);
    if (!lease) return this.requestGuard.rejectedResponse(currentState?.scope, fingerprint)
      ?? required('This model request was already delivered, failed, or reached the Query safety limit. Automatic replay is blocked.'
        + streamFailureMessage(this.requestGuard.failureDiagnostic(currentState?.scope)));
    if (state.blocked || this.ledgerBlocked || state.recovering || state.inFlight.has(fingerprint) || state.delivered.has(fingerprint)
      || (state.recovered && this.requestGuard.inFlightCount > 1)) {
      lease.finish();
      return required('This turn already has a delivered, concurrent or failed model request. Automatic replay is blocked.');
    }
    state.inFlight.add(fingerprint);
    const retryAnalysis = analyze(body, state.denied, state.completed, this.noDispatchLedger, this.nativeErrors, this.readonlyTasks);
    const retryFence = {};
    if (!retryAnalysis || retryAnalysis.uncertain.size || state.uncertain.size) this.requestRetryFences.add(retryFence);
    let deliveryFinished = false;
    let interruptionCause: StreamInterruptionCause | undefined;
    let interruptionObservedAt: number | undefined;
    const observeInterruption = (cause: StreamInterruptionCause) => {
      if (!deliveryFinished && queryLive() && interruptionCause !== 'unproven') {
        interruptionObservedAt ??= Date.now();
        interruptionCause = cause;
      }
    };
    let failureCandidate: StreamFailureDiagnostic | undefined;
    const observeFailure: StreamInterruptionObserver = (cause, diagnostic) => {
      observeInterruption(cause);
      if (!deliveryFinished && queryLive()) failureCandidate ??= safeStreamFailure(diagnostic);
    };
    const blockedFrame = () => formatReplayBlockedStreamError(this.requestGuard.failureDiagnostic(currentState?.scope));
    const finish = () => {
      deliveryFinished = true;
      state.inFlight.delete(fingerprint);
      state.delivered.add(fingerprint);
      lease.finish();
      this.requestRetryFences.delete(retryFence);
    };
    const stop = (message: string) => { state.blocked = true; state.streamInterrupted = false; lease.block(); return required(message); };
    const prepare = async (initial: boolean): Promise<AnthropicRequest | Response> => {
      if (!recoveryLive()) return required('The foreground recovery owner ended. Existing requests were preserved.');
      const analysis = analyze(body, state.denied, state.completed, this.noDispatchLedger, this.nativeErrors, this.readonlyTasks);
      if (!analysis || analysis.uncertain.size || state.uncertain.size) {
        return stop('History contains unknown, unpaired or uncertain tool actions. Progress was preserved; automatic recovery stopped.');
      }
      const before = Buffer.byteLength(canonical(body));
      let archive: string;
      try { archive = await this.options.backup(body, { digest: originalDigest, scope: state.scope }); }
      catch { return recoveryLive() ? stop('The original history could not be durably archived. Automatic recovery stopped.') : cancelled(); }
      if (!recoveryLive()) return cancelled();
      if (typeof archive !== 'string' || !archive.trim() || archive.length > 4096 || /[\r\n]/.test(archive)) {
        return stop('The original history archive reference is invalid. Automatic recovery stopped.');
      }
      const projected = project(body, archive);
      const after = Buffer.byteLength(canonical(projected));
      if (this.options.canRecover?.() === false && (initial || canonical(projected) !== canonical(body))) {
        return initial ? stop('Native background work became active during archival. Context reduction was refused.')
          : required('Native background work is active. Context reduction was refused; progress was preserved.');
      }
      if (initial && (before - after < 4096 || after > before * 0.85)) {
        return stop('Protected user constraints, tool inputs and recent evidence leave insufficient safe context reduction.');
      }
      // Native /compact can remove the bulky prefix entirely. Keep the guard without
      // requiring another omission in the already-small, now durably backed-up history.
      if (!initial && after > before) return stop('The archived history cannot be safely reduced further.');
      const completed = new Map([...analysis.completed].map(([key, value]) => [key, { ...value, archive, digest: originalDigest }]));
      if (!this.mergeLedger(completed, analysis.uncertain)) return stop('Recovery ledger capacity exceeded. Progress was preserved.');
      for (const [key, value] of completed) state.completed.set(key, value);
      state.recovered = true;
      this.projectionActive = true;
      this.actionProtectionActive = true;
      try { await this.persist(); } catch { return stop('Recovery ledger could not be durably committed.'); }
      if (!recoveryLive()) return cancelled();
      if (initial) try { this.options.onRecovery?.({ digest: originalDigest, archive }); } catch { /* observability cannot replay inference */ }
      return projected;
    };
    let streamOwnsFinish = false;
    let ownsRecovery = false;
    try {
      if ((typeof this.options.protectStreaming === 'function' ? this.options.protectStreaming() : this.options.protectStreaming)
        && recoveryOwner && !ambiguous && body.stream === true) await this.protectInference(body, true);
      const input = state.recovered ? await prepare(false) : body;
      if (input instanceof Response) return input;
      if (!live()) return cancelled();
      let response = await execute(input, observeFailure);
      if (!live()) { void response.body?.cancel().catch(() => undefined); return cancelled(); }
      if (!response.ok && [400, 413, 422].includes(response.status)) {
        const text = await readBoundedErrorBody(response.body);
        if (!live()) return cancelled();
        if (text === undefined) return stop('The upstream error body was incomplete. Automatic recovery stopped.');
        if (!explicitlyOverflowed(text)) {
          return await lease.reject(new Response(text, { status: response.status, headers: response.headers }));
        }
        if (state.attempted) return stop('Context recovery was exhausted. Progress and archived evidence were preserved.');
        if (!recoveryLive() || this.requestGuard.inFlightCount > 1 || this.options.canRecover?.() === false) {
          return required('Another native inference or background action is active. Context recovery was refused; existing work was preserved.');
        }
        state.recovering = true;
        ownsRecovery = true;
        state.attempted = true;
        const reduced = await prepare(true);
        if (reduced instanceof Response) return reduced;
        if (!recoveryLive()) return cancelled();
        failureCandidate = undefined; // A replaced inference attempt cannot become the final first cause.
        response = await execute(reduced, observeFailure);
        if (!live()) { void response.body?.cancel().catch(() => undefined); return cancelled(); }
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          return stop('The single inference retry after context recovery failed. Progress and archived evidence were preserved.');
        }
      }
      if (!response.ok) return await lease.reject(response);
      if (!response.body) return response;
      // Hold request admission until the consumer finishes. A partial stream seals the whole
      // turn, including changed fingerprints, so native SDK stream rescue cannot replay tools.
      const reader = response.body.getReader();
      const bodyReader = new ModelBodyReader(reader, request.signal, live);
      const isSse = response.headers.get('content-type')?.includes('text/event-stream') === true;
      const parser = new SSEParser();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let terminal = false;
      let terminalQueued = false;
      let consumerCancelled = false;
      const witness = new StreamDeliveryWitness();
      const observeDelivery = (data: string): void => {
        let payload: unknown;
        try { payload = JSON.parse(data); } catch { lease.unknownDelivery(); return; }
        const emission = witness.observe(payload);
        if (witness.invalid) lease.unknownDelivery();
        if (emission.completedTool) {
          const { id, name, input } = emission.completedTool;
          const owner = this.toolOwners.get(id);
          this.nativeRevision++;
          if (owner?.fingerprint === fingerprint && !owner.actionHash) owner.actionHash = recoveryActionHash(name, input);
          else this.unboundNativeAdmission = true;
        }
        if (Object.hasOwn(emission, 'toolUseId')) {
          const id = emission.toolUseId;
          lease.toolMayBeDelivered(id);
          if (typeof id === 'string' && id.length <= 256 && !this.toolOwners.has(id) && this.toolOwners.size < MAX_LEDGER_ENTRIES) {
            this.toolOwners.set(id, { scope: currentState?.scope, fingerprint });
          } else this.unboundNativeAdmission = true;
        }
      };
      const interruptStream = (trusted = true) => {
        if (!terminal && !state.blocked && recoveryLive() && !consumerCancelled) state.streamInterrupted = trusted;
        state.blocked = true;
        lease.interrupted(interruptionObservedAt);
        lease.block();
      };
      const stream = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            if (!live()) {
              state.blocked = true;
              state.streamInterrupted = false;
              lease.block();
              lease.unknownDelivery();
              lease.interrupted();
              void reader.cancel().catch(() => undefined);
              finish();
              output.error(new Error('Model request superseded or cancelled'));
              return;
            }
            let next: ReadableStreamReadResult<Uint8Array>;
            let frames = '';
            // Keep one downstream pull alive across comments and partial records;
            // every upstream wait still goes through the body idle watchdog.
            while (true) {
              next = isSse ? await bodyReader.read() : await reader.read();
              if (consumerCancelled || !live()) throw new Error('Model request superseded or cancelled');
              if (next.done || !isSse) break;
              for (const event of parser.feed(decoder.decode(next.value, { stream: true }))) {
                const payload = parseModelStreamEvent(event);
                if (payload && hasModelStreamProgress(payload)) bodyReader.markProgress();
                if (payload && payload.type !== 'error') observeDelivery(event.data);
                const type = payload?.type;
                if (!type) continue;
                if (type === 'error') {
                  // Raw Anthropic errors have no translator. Use only their exact type,
                  // never model/provider message text or synthetic diagnostic fields.
                  try {
                    const payload = JSON.parse(event.data) as { error?: { type?: unknown } };
                    lease.recordFailureDiagnostic(failureCandidate ?? streamFailure('provider_terminal', payload.error?.type));
                  } catch { lease.recordFailureDiagnostic(failureCandidate ?? streamFailure('protocol_validation')); }
                  if (interruptionCause !== 'transport') lease.unknownDelivery();
                  interruptStream(interruptionCause === 'transport');
                  output.enqueue(encoder.encode(blockedFrame()));
                  void reader.cancel().catch(() => undefined);
                  finish(); output.close(); return;
                }
                frames += formatSSEFrame(event);
                if (type === 'message_stop') { terminal = true; break; }
              }
              if (frames || terminal) break;
            }
            if (consumerCancelled || !live()) throw new Error('Model request superseded or cancelled');
            if (next.done) {
              if (isSse && !terminalQueued) {
                const trustedEof = interruptionCause !== 'unproven' && !parser.hasIncompleteEvent;
                if (!trustedEof) lease.unknownDelivery();
                lease.recordFailureDiagnostic(failureCandidate ?? streamFailure('unproven_eof'));
                interruptStream(trustedEof);
                output.enqueue(encoder.encode(blockedFrame()));
              }
              finish(); output.close(); return;
            }
            if (consumerCancelled || !live()) throw new Error('Model request superseded or cancelled');
            if (!isSse) output.enqueue(next.value);
            else if (frames) output.enqueue(encoder.encode(frames));
            if (terminal) {
              terminalQueued = true;
              lease.delivered();
              void reader.cancel().catch(() => undefined);
              finish();
              output.close();
            }
          } catch (error) {
            if (!terminalQueued) {
              const trusted = queryLive() && !consumerCancelled && (interruptionCause === 'transport'
                || (interruptionCause !== 'unproven' && error instanceof ModelBodyIdleTimeoutError));
              if (queryLive() && !consumerCancelled) lease.recordFailureDiagnostic(failureCandidate ?? streamFailure(trusted ? 'transport' : 'protocol_validation'));
              if (!trusted) lease.unknownDelivery();
              interruptStream(trusted);
            }
            void reader.cancel().catch(() => undefined);
            finish();
            if (isSse && !terminalQueued && !consumerCancelled && queryLive()) {
              output.enqueue(encoder.encode(blockedFrame()));
              output.close();
            } else output.error(error);
          }
        },
        async cancel(reason) {
          consumerCancelled = true;
          state.streamInterrupted = false;
          if (!terminalQueued && isSse) { state.blocked = true; lease.unknownDelivery(); lease.interrupted(); lease.block(); }
          finish();
          try { await reader.cancel(reason); } catch { /* transport already retired */ }
        },
      });
      streamOwnsFinish = true;
      return new Response(stream, { status: response.status, headers: response.headers });
    } catch (error) {
      if (!live()) return cancelled();
      if (error instanceof RecoveryPreparationError) return stop(error.reason);
      return stop('The model transport failed. Automatic replay is blocked and progress was preserved.');
    } finally {
      if (ownsRecovery) state.recovering = false;
      if (!streamOwnsFinish) finish();
    }
  }
}
