# MB-REPLAY-RECOVERY-20261030 — backend

Base: `f072eff9a94724fc8802e939e51255dbf625ea3d`; shared branch `codex/replay-recovery-20261030`. Integration and release remain with the primary owner. No live ledger/transcript write, inference, tool replay, app restart, CI, push or release was performed by this worker.

- [x] Trace original denial and recovery owner paths.
- [x] Record future intent/delegation PreToolUse denials through the existing controller/SessionStore before tool admission.
- [x] Support strict selected-chain historical hook-denial review through the existing signed review/CAS route.
- [x] Keep raw unknowns and receipts; allow a new explicit same-input attempt while preserving old ID fences and future uncertainty.
- [x] Repair missing historical tool error metadata through the existing Product writer, matching unique IDs/name/input hashes and flushing persistence.
- [x] Preserve native `is_error` on root and child user-result delivery paths.
- [x] Test policy, negative evidence, per-attempt safety, actual Store persistence and typed delivery.
- [x] Probe original native/ledger/checkpoint/product histories using memory copies only.

## Root cause and change

The intent hook returned its rejection before `authorizeTool`, so no native pre-execution denial receipt reached the recovery ledger. History analysis treated the two error results as unknown business outcomes. Later `automatic_replay_blocked` denials had receipts; the first two legacy leads kept the Session in reconciliation-only mode. Native user-result delivery also omitted `is_error` when updating/broadcasting Product tools, leaving all four rejected tools without typed error metadata.

The historical contract requires SDK-selected messages and original structured native records. It binds Session, complete input hash, unique tool ID, selected use/result UUIDs and exact result digest, requires typed hook rejection plus root/source/parent agreement, and rejects unproven peers. The public SDK import API collects only into bounded memory; SDK path resolution remains authoritative. No shell read-only heuristic is used.

The signed route appends `preToolDenials`, retains raw `uncertain`, and removes only the reviewed `operationAttempts.legacyUncertain` lead. Receipt effects apply to exact old IDs/results. New same-input admissions use the existing operation journal; a new unknown re-establishes blocking across restart. Old native IDs cannot be reused. Live request/turn/Stop fences remain unchanged.

Product repair validates all unique ID/name/input matches first, then appends only `isError:true` through `ProductTranscriptContent` and `TranscriptWriter.flushForMutation`. Both unresolved legacy denials and later known native denials are included. Commands, result text, order and timing remain intact. Mismatches and persistence failures are explicit.

## Verification

Runtime: dependencies from existing 527.3 source; `/opt/homebrew/opt/node@24/bin/node` v24.21.0. No external Provider calls.

- Eight focused unit files: **181 tests passed**. Includes provenance negatives, new same-input admission success/error plus cold restore, old ID reuse rejection, four-tool metadata repair and mismatch rejection, existing recovery/journal/routes.
- Existing checkpoint and warm-idle integration files: **26 tests passed** before adding the new Store case; new case **1 passed**, verifying two historical reviews, raw unknown preservation, four Product error repairs and cold reload through real SessionStore.
- Full builtin Product/SDK integration file: **187 tests passed** (79.93 seconds), including the two new root/child typed error delivery cases and all existing turn, stream, stop, queue, rewind and recovery regressions.
- TypeScript `tsc --noEmit`: passed. Scoped backend/shared/script ESLint: passed. `git diff --check`: passed.
- Original-history memory probe: SDK selected **90**, raw **154**, **2** eligible structured hook denials, **2** resolved, remaining **0**, cold effective uncertainty **0**, original checkpoint restored with inference retry allowed; Product repairs **4** in memory. Source ledger and Product SHA/mtime unchanged. Tool executions **0**.

Reproduce with `node --import tsx/esm scripts/verify-historical-denial-recovery.ts --ledger FILE --dir WORKSPACE --checkpoint ARCHIVE --product V2_FILE`. Sources must be explicit private paths. Output contains redacted IDs/counts; reconciliation and Product repair stay in memory. This proves the policy accepts original evidence, not production installation, native UI recovery or original business completion.

## Handoff

Primary owner integrates, reviews and exercises the recovery control on the published build. Original live files remain protected; users need no manual flag deletion or replacement Session. Recovery reissues no command. General uncertain mutations still need authoritative receipts.
