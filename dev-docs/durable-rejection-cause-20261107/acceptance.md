# Durable recovery rejection cause — MB-MODEL-REJECTION-CAUSE-20261107

## Observed behavior and cause

Installed 543.6's controlled native HTTP 502 / Retry-After: 3600 case ended as HTTP 499 without an operator Stop. Its persisted recovery owner was paused with lastStatus 502 and reason Model recovery window expired; execution remained incomplete. This differs from the earlier explicitly Stopped control, where cancellation is legitimate.

SessionModelRecovery.wait can pause itself and return undefined when it declines a wait. agent-session's canRetry observes that pause. ModelFailover checked recoveryLive before examining undefined, confusing retry-authority withdrawal with cancellation of a still-live Query.

## Change and safety

A declined wait checks the existing request/route/root/owner lifetime and then seals the original bounded upstream rejection. A genuine Stop (including its synchronous interrupt before Request.signal abort), route/root/owner replacement still cancels. The next identical SDK request remains sealed. No automatic business replay, ledger mutation, new retry/wait budget, context compaction, permission expansion or provider-policy change is introduced.

## Local evidence

- Baseline failures: three unit status cases (429/502/503), plus actual SessionModelRecovery and real loopback HTTP in Anthropic and OpenAI protocols, returned 499 instead of the original status.
- Fixed: 256 unit and 94 integration tests pass, including five cancellation/revocation controls and duplicate-fingerprint suppression.
- Full tsc --noEmit, scoped eslint --max-warnings 0, test-classification check pass.
- Private raw logs and source-checks.json remain under project work/MB-RECOVERY-INCIDENT-20261101/followup-20261107/durable-rejection-source/; no runtime data or credentials are committed.

## Delivery gates

Source/local verification is complete. Remote main, exact CI, signed immutable artifact, installed native original-502/connection recovery and original-session acceptance are separate pending gates. The existing sole desktop/macOS-arm64/updater/sharedCI/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 receives the exact source SHA. The failed 543.6 artifact is preserved and not promoted or replaced in place.
