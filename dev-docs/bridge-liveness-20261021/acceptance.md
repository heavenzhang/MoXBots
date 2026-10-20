# MOXBOTS-BRIDGE-LIVENESS-20261021

Owned Session inference can receive HTTP200 headers then only ping frames or no body bytes. The header timer has already ended, so no transport error reaches existing recovery until the outer600s Session watchdog revokes the turn. This is a source-confirmed liveness gap. Installed5156 logs show compaction-only status for e181 and separate post-compaction silence for5025; they do not identify each exact provider socket phase. A successful prior40ef turn and laterECONNRESET are separate evidence, not universal SDK breakage.

## Resulting behavior

Only an admitted ModelFailover request uses the new body reader. Its default5-minute active idle budget counts pending reads, not answer total duration, downstream backpressure or process suspension. Existing suspension-aware watchdog semantics apply, including a response arriving before the first timer tick on wake. Pings and metadata do not replenish the budget; only payloads containing nonempty text/thinking/tool-JSON fragments, actual tool identity/redacted thinking, or the typed terminal do. Empty deltas, usage-only updates and empty block boundaries do not. At timeout the old reader is cancelled before waiting for durable IO, then the existing exact owner receives interrupted/blocked. Protocol completion still requires a typed message_stop actually queued downstream. Stop/Query/route revocation releases the held read, and the original inference lease remains sealed against SDK repetition.

This patch never changes canRetry. That callback includes interrupt/paused authority and unknown action outcomes; a boolean false cannot safely be reinterpreted as permission to retry a zero-output model request. No pre-delivery retry bypass, tool replay, ledger clearing, provider switch, new native owner, Session metadata rewrite or change to the existing safety test assertions on recovery authority is introduced.

## Evidence

- Original1edf heartbeat-only fixture fails: cancellation expected1, actual0. This establishes the missing bound before the implementation.
- Node24.21.0:215 focused unit tests pass, including16 new cases: heartbeat-only, silent body before durable IO, partial/unknown-tool fence, healthy long stream, downstream backpressure, process suspension, exact owner revocation, read resolution before wake tick, and authority-check failure without an uncaught timer exception.
- Node24:56 integration tests pass. Four new real loopback TCP cases exercise Chat Completions and Responses headers+ping only; both close the upstream connection, request original-owner continuation once, make one inference, never emit success terminal. Existing header/error-body/context/body-admission/failover cases remain covered.
- Full TypeScript and changed-file ESLint pass. Root manually reviewed timeout/timer disposal, reader cancellation before IO, replay authority, request revocation, suspension and backpressure; no independent reviewer was spawned.
- Three old Stop fixtures attempted to write/close their source after cancellation. They now assert the immediate source cancellation and retain all original no-terminal/no-complete/no-continuation/no-next-inference assertions. Broader original failure output is retained; tests were not deleted or skipped.
- Local diagnostic/test raw logs: WPS project work/bridge-liveness-20261021; original native log indexes under release0515 owner/candidate5156. These are private read-only local receipts, not uploaded credentials or task payloads.

## Delivery boundary and dependencies

Source branch codex/bridge-liveness-20261021, based on pendingPR173 source1edf. Product version515.6 is not rebuilt or overwritten. agent-session/Chat/SessionStore remain owned by the separate durable ledger reconciliation work; this patch only changes the bridge reader/failover plus tests/provider note. No native UI, application restart, activeTask, provider configuration or credentials were touched.

Exact combinedCI, normalmain merge, remote containment, a new immutable build, signednative/provider stalled-body/compaction/Goal recovery and online stable publication remain pending. A real Goal with an unknown mutator must still pause until its existing owner can verify it; this transport patch alone does not claim all long-running tasks repaired. Graceful GoalStop need not terminate the persistent Query, so same Query/inputGeneration is not itself evidence of a Stop defect.


## Independent primary review follow-up

The existing recovery coordinator reviewed62da and correctly identified that a type-only progress check renewed the budget for empty content_block_delta/message_delta. This P1 was independently reproduced: all5 empty text/thinking/tool-arguments/usage/empty-boundary cases failed before the follow-up. The revised parser reuses the exact typed-JSON payload once and checks actual content, preserving nonempty thinking and partial toolJSON. ResponsesStreamTranslator.handleTextDelta forwards even empty delta strings, so the defect was reachable, not merely an artificial fixture. Real loopback Responses and Anthropic empty-text cases now release their connections without successful completion or repeat inference. The healthy long-stream fixture now carries actual text/thinking/partialJSON rather than type-only frames. No new candidate may inherit the original type-only implementation; current5156 is untouched.

The coordinator's later e181 post-Stop admission/compaction observation is a separate, unproven boundary. A request not yet inside a Bridge body read cannot be repaired by this reader; neither this patch nor its loopback tests prove that actual Goal repaired. GracefulStop may retain the persistent Query. Existing native lifecycle and reviewer-owned files are unchanged.
