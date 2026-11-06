<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/bridge-precontent-recovery-20261107 -->
<!-- git-project-sync-task:base=4ceeb2d21acc164487ef199b4a5788d7d27c65f1 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Bound exact pre-content inference recovery while preserving unknown operations

## Objective

Stable ID: MB-BRIDGE-PRECONTENT-RECOVERY-20261107. Investigate and narrowly recover a new admitted Chat Completions inference whose transport fails before response headers, even when unrelated old operations remain uncertain. Preserve the original session, exact operation fences, stream replay restrictions and existing attempt budgets. This source task does not own shared CI, release versions, signing, installation or publication.

## Acceptance criteria

- [x] Reproduce a real loopback socket close before headers with known historical uncertainty; demonstrate current failure.
- [x] Permit bounded retries only from trusted current-attempt transport evidence for client-executed function-tool inference. Preserve old ledger entries and block repeated SDK fingerprints.
- [x] Reject after-header/partial-stream, cancellation, stale owner/route/attempt, unsafe history and unsupported tool/protocol cases. Do not grant durable recovery or shorten existing header limits.
- [x] Run affected unit/integration/type checks and document evidence and remaining native limits.
- [ ] Commit and push exact source; original desktop owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 reviews and integrates through its existing release unit.
- [ ] Remote-main delivery and release/native acceptance are recorded separately after owner integration.

## Completed

- Confirmed source base 4ceeb2d21acc164487ef199b4a5788d7d27c65f1 and isolated branch; project-sync observe/start/task-init passed.
- Diagnosed real request 1d797d12: no HTTP response obtained; UND_ERR_SOCKET surfaced as local 502, fast recovery disabled. Existing known uncertainty is sufficient to block generic replay. No ledger entries changed.

## Verification

88 model-failover unit + 68 context unit + 103 integration cases PASS; TypeScript and affected lint PASS; actual SDK/native Bash socket-failure/candidate/counter/journal loopback PASS. Acceptance details and limits: dev-docs/bridge-precontent-recovery-20261107/acceptance.md. Root incident evidence: work/MB-RECOVERY-INCIDENT-20261101/followup-20261107/real-502-independent-diagnosis.json in the project collaboration directory. Evidence contains bounded diagnostics only.

## Blockers and unknowns

Before-header failure does not prove the provider never accepted the POST; a repeated inference can duplicate computation/billing. Only client-executed function tools can be eligible, and no model response may have reached the client. Historical uncertainty must never be cleared on this basis. 543.4 release preparation is independent of this task; candidate assignment remains with the original owner.

## Next step

Finish final scope review, commit/push and project-sync handoff to the sole desktop release owner for next-batch integration.
