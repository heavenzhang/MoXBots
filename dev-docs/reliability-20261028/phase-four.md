# MB-RELIABILITY-20261028 — phase four

## Finding and behavior

The short retry loop previously honored a long `Retry-After` only if a durable foreground recovery hook was available. Background or hookless requests therefore made four rapid attempts despite a 60-second provider cooldown. Seven cases failed on the previous commit, including numeric/date cooldowns and transition to a permitted candidate. This source defect can amplify overload/rate limiting; it does not establish the cause of every historical TLS/502/stall report.

The same ModelFailoverController now stops that target's short retry loop whenever a valid cooldown exceeds its next short delay. Existing authorized foreground candidate and durable-wait policy remain responsible for what happens next. Background/hookless requests return the original rejection and cooldown header; this change grants no new long-wait, failover or execution authority. Invalid/expired cooldowns retain the existing bounded retry count; short cooldowns fit the existing cancelable timer and original parent deadline. HTTP rejection evidence remains available to an SDK repeat without another provider call.

A bounded `inference_retry_deferred/provider_cooldown` observation explains the decision without raw URLs, header text, payloads or secrets. Native unmatched/retired callbacks now explicitly emit `commit_unmatched` instead of leaving only a commit-enter observation. This is diagnostic only; phase-three exact admission rules are unchanged. No UI redesign or new state owner was introduced.

Protocol reference checked: [RFC 9110 section 10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after), which defines the advisory wait as an HTTP date or delay in seconds. Existing parser compatibility and bounds are retained.

## Verification

- Before change: **7 failures / 17 new cases** (`phase4-baseline.log`).
- Final matrix: **21 files / 490 tests passed** (`phase4-regression.log`), including the prior per-attempt/Store/stream/review matrix, 19 cooldown tests, causal diagnostics, real loopback HTTP, original budget, Stop and unknown-operation guards.
- Real loopback HTTP: foreground without durable hooks and background each make one 429 request, preserve Retry-After=60, and retain original 429 on repeated inference without another upstream call.
- Actual installed SDK/native MCP counter with synthetic model, `scripts/verify-model-failover-loopback.ts --retry-after`: **counter=1, primaryCalls=2** (one tool-producing inference, one failing follow-up), backupCalls=0, switches=0, rejectedResponses=2. The synthetic gateway deliberately removes downstream Retry-After and the first retry hint to force one SDK repeat promptly. Production header preservation is separately checked by the real-HTTP tests. Native terminal retains HTTP503 and automatic-replay protection. This is not a real provider or installed UI acceptance.
- TypeScript, scoped ESLint, test classification and whitespace checks passed. Dependency check: zero errors, 18 pre-existing warnings.
- Expanding the matrix exposed four diagnostic fixture failures left by phase three: fixtures had anonymous callbacks rather than exact bound native admission. Persistence tests now bind owner/tool ID; anonymous callbacks explicitly assert unmatched status. Receipt authority was not loosened. Initial and retest logs remain private.

Private logs and receipt manifest are under `work/MB-RELIABILITY-20261028/phase4-*`; raw SDK scratch data remains outside Git. No production credential, original business session, ledger or installed application was changed. No UI changes this phase; existing DOM regression passed. One agent performed implementation/review; no delegated model calls, token/cost total not measured.

## Delivery and remaining work

- [x] Cooldown fix and non-authoritative diagnostic outcomes.
- [x] Deterministic fault matrix, real HTTP, actual SDK and no repeated counter side effect.
- [ ] Existing desktop owner source review, latest-main integration and shared CI.
- [ ] Signed artifact, installed native/real-provider fault matrix and sustained observation.
- [ ] General business receipt reconciliation, original unknown operations and automatic cold continuation.

Branch `codex/reliability-20261028`, parent `f57f2783402fab7291646064501de0c7d07c9093`, original base `caab6ab648b434bee17930f90c4df4de87564bba`. Remote main observed `775da22c196b5c72277469c3c1a357d360f030e6`; the existing owner must integrate the current main at review time. Source progress is not main or production delivery.

The sole desktop/macOS-arm64/updater and combined-CI/main owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Hand off the exact pushed SHA to the next unfrozen batch. Preserve frozen 0.5.25/525.1 source `45a9e22e896b4c6238132463405b0f212bc2bb52`. This chat does not allocate a version, run shared CI/formal builds, install or replay the business tasks. No phase-four formal artifact/digest exists yet.
