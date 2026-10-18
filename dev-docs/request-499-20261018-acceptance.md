# MOXBOTS-REQUEST-499-20261018

## Delivery contract

Fix normal native SDK background requests being rejected when the parent Product turn completes. Exact Query/token/Session/route revocation and request abort continue to stop delivery. Retry only unexposed availability failures: one original inference plus up to three retries per selected route, without re-enqueuing user input or invoking tools in the bridge. User explicitly authorized integration into `heavenzhang/MoXBots` main and arranging a repair release; the daily app and active user tasks must remain untouched.

## Evidence and independent verification

The preceding investigation found matching local 499 branches in both recovery controllers. The installed 0.5.11 bundle contains these branches. Production logs showed parent completion followed by background 499. These facts do not classify every past 499 as this defect; explicit stops can produce the same text.

- Independent paired-controller loopback regression initially reproduced normal new background request and existing SSE cancellation.
- Actual SDK 0.3.296/native Agent fixture initially returned background task status `failed` after parent completion, while the synthetic supplier and exact Query remained alive.
- `scripts/verify-background-lifecycle-loopback.ts` uses the real SDK Agent tool, programmatic child definition, an isolated temporary HOME/workspace, local synthetic suppliers and a local MCP counter. It waits for the parent result, retires the foreground recovery scope, then permits the child response. The child must finish with one counter increment. `--after-recovery` repeats this with an armed archive and durable action ledger; a new background action must reserve and commit the ledger after the parent completes. No user account/provider or business data is used.
- `scripts/verify-model-failover-loopback.ts` checks four failed availability attempts after a successful tool action, then fallback, with the counter still one. The partial-stream mode must never call backup/repeat the counter. The stop-during-retry mode marks the existing Product interrupt fence and sends actual native Query.interrupt; no next retry or fallback may run, and the native acknowledgement must complete. A transport-only initial experiment allowed one additional retry during SDK cancellation propagation; this exposed the need to consult the existing synchronous interrupt owner before every retry.

SDK sources checked: installed `sdk.d.ts`, `sdk-tools.d.ts` (0.3.296) and [official SDK subagent documentation](https://code.claude.com/docs/en/agent-sdk/subagents). Local installed definitions are authoritative for the tested version.

## Verification status

- [x] Focused implementation and independent paired-controller tests.
- [x] Exact Query revocation/HTTP abort during backoff, response wait, and stream read.
- [x] Three retry rounds without backup or during background work; backup budget; permanent failures and uncertain action fence.
- [x] Partial stream/duplicate fingerprint safety and old background/new foreground ownership isolation.
- [x] Actual SDK/native background Agent and MCP exactly-once fixture.
- [x] Actual SDK/native failover and partial-stream fixtures.
- [x] Typecheck, changed-file lint, build and final normal CI39145233968 on642e2820.
- [x] Remote mainfe82002e verified by fetch, source ancestry and exact CI/main tree.
- [x] Registered release owner received acceptedmain and queued final0512 combination; no signed/native/publication claim.

Raw local evidence is in the project pointer `output/request-499-20261018/`; machine-only absolute paths and generated logs are not committed as product data. Initial reproduction failures are retained separately from final success.

## Accepted local evidence

- Final focused suite: 126 assertions across six files: 24 retry/guard unit, 37 context unit, 17 Session strategy, 18 HTTP failover, 3 HTTP context, 27 independent paired-controller scenarios. Commands run with Node 24.21.0.
- Actual native SDK fixtures passed: background continuation before and after an archived recovery checkpoint (parent completes while child continues two calls, child completes and counter=1); availability failure (one tool-producing inference, four failed primary attempts, one backup, counter=1); partial stream (no backup and no repeated counter); Stop during backoff (native interrupt acknowledged, no later retry/backup, counter=1).
- Independent review also verified in-place model changes keep the same Query usable while discarding old-route late output; optional backup disabled does not cause repeated Query restarts; background failed tool results survive parent cleanup; ledger growth and request admission are bounded without cancelling accepted healthy streams.
- Armed background continuation forwards its original body without new context reduction. It still uses durable Query ledger reservation/commit; completed/uncertain actions and corrupted ledgers remain blocked. A genuinely oversized detached background request may require a foreground recovery owner; it does not obtain permission to silently shrink history.
- Remaining final typecheck/build/normal CI and remote-main status are tracked in the task record and PR. Native installation and production publication are separate release-owner gates.

## Safety and release boundaries

All tests are loopback and isolated. No app stop, restart, installation, identity modification, active session mutation, production supplier calls or business writes are part of this development chat. The registered release chat `01a12bc2-907a-7702-b6dd-788225c5dfe4` owns candidate packaging/signing and publication. Signed candidate, updater promotion, native installation and real user acceptance remain distinct gates; queue receipt is not publication.

## Execution

Primary Agent owns requirements, native fixture, integration, final verification, main delivery and release handoff. lifecycle_review owns implementation and adjacent regression; combined_acceptance independently owns paired-controller test and diff review. Both workers were requested as gpt-6.1-sol/high under ai-yaoren-local because the recovery/request authority split can affect cancellation and duplicate side effects. Actual runtime model/usage/cost were not exposed. No external models were called: native tools and deterministic fixtures suffice.

Review/repair record: initial independently reproducible 499, then route/optional-backup wiring, post-parent unknown outcomes, armed continuation/backup ownership, bounded ledger admission, and synchronous Stop fence were corrected before acceptance. The same owners repaired and retested each defect. This is measured verification coverage, not an estimate of model cost savings.

Final admission-race review: a background request must not acquire foreground failover permission when the background registry drains during an upstream await. The old candidate reproduced this as a wrong backup success; admission-pinned permission fixes it. Context recovery already captured its admission owner; a new control regression confirms that a detached overflow cannot borrow the later foreground budget. Dynamic revocation is still checked at each recovery boundary. Final focused result: 126/126.
