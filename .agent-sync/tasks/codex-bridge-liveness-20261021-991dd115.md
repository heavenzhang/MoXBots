<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/bridge-liveness-20261021 -->
<!-- git-project-sync-task:base=4206eb2ef8f8bf2f9dc211b4f13842441dead0de -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-BRIDGE-LIVENESS-20261021

## Objective
Bound owned inference body reads after successful headers without confusing transport heartbeats with model progress, replaying tools, or replacing Session/Goal lifecycle authority.

## Acceptance criteria
- [x] Read-only installed5156 logs/source; distinguish compaction pending, post-compaction silence and actual ECONNRESET.
- [x] New negative heartbeat-only regression fails on original1edf code; fixed targeted unit and actual loopback tests pass.
- [x] Preserve replay/Stop/route fences, release socket before durable recovery IO, exclude process suspension and downstream backpressure.
- [x] Final215unit/56integration checks, fullTypeScript, scopedlint and Root source review. Remote head/handoff receipt is recorded outside this commit.
- [ ] Exact combined candidate CI, normal main delivery and remote containment by original desktop owner.
- [ ] New immutable candidate and native long-run/provider acceptance; online release separately gated.

## Completed
ModelFailover body reader uses the existing suspension-aware watchdog while reads are pending; known content events reset the idle budget. Timeout cancels transport first and invokes only existing original-owner recovery hooks. No agent-session, Chat, SessionStore, runtime configuration, tasks, credentials or current5156 App changes.

## Verification
Negative original fixture expected cancellation after heartbeat-only200 but got0; fixed16 new unit cases cover idle/deadline/Stop-equivalent revocation/progress/backpressure/suspension/unknown actions. Existing199 unit cases and56 bridge integration cases pass onNode24, including real Chat/Responses loopback TCP closure. One original abort fixture now asserts immediate source cancellation rejects a late producer terminal, preserving its original no-checkpoint-clear assertion.

## Dependencies and ownership
DesktopCI/release owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Base includes pendingPR173/source1edf. Existing recovery worker owns agent-session/Chat/SessionStore durable ledger review; this work only touches bridge reader/failover/tests and provider tech note. LoginPR175/mobilePR174 remain separately pinned; no sharedCI run or product version assigned here.

## Blockers and unknowns
Hosted arm64 Mac requiredCI for currentPR173 twice could not allocate runner. This source is not merged/published/installed. Long-run native acceptance and per-item uncertain ledger resolution remain separate; canRetry=false also means interrupt/paused authority and cannot be bypassed based merely on no stream bytes.

## Next step
Finish final checks and push source; integrate the next unfrozen batch through exact combinedCI and normal main, then test actual native/provider stalled reads and originalGoal recovery with the companion ledger path.

Independent primary review found type-only idle renewal P1 in62da. Five new regressions reproduced it; the current payload-based follow-up fixes empty/usage/boundary renewal and preserves real text/thinking/toolJSON. Actual native postStop compaction/admission is separately unverified, not claimed repaired.
