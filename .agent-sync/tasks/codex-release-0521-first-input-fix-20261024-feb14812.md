<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0521-first-input-fix-20261024 -->
<!-- git-project-sync-task:base=71871fc57ee2c4f29b63931dc29654520aa3f6aa -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Fix first desktop execution intent classifier default mode

## Objective

MOXBOTS-0521-UNIFIED-BATCH-20261024 correction: first signed desktop input on a fresh builtin Session with absent modelMode must use the product default auto classifier. Preserve manual mode, original proof/ledger/Stop authority and existing package bytes.

## Acceptance criteria

- [x] Reproduce undefined-mode utility failure without SDK turn or upstream network.
- [x] Use shared normalizeModelMode; no second routing/config owner.
- [x] Affected integration/type/lint checks pass (260 tests; tsc and scoped ESLint exit0).
- [ ] Exact corrected CI and normal remote-main merge.
- [ ] New immutable build521.2 only after corrected source is accepted; targeted native first input and remaining deliverable path.
- [ ] Same verified artifact installed locally and promoted by sole Root publisher; old519 rollback retained.

## Completed

A fresh signed521.1 Session showed INTENT_UNCONFIRMED with no execution ledger. Actual QA CWD was correct; no wrong-CWD diagnosis or permission bypass. The existing auto-route admission normalizes absent modelMode to auto, but runTextUtility compared strictly to auto before the first query. The real adapter regression reproduces undefined-mode failure; explicit auto/manual controls pass. A one-policy-call correction passes all three targeted cases.

## Verification

Initial regression: 1 failed (absent mode), 2 passed. Corrected targeted regression: 3 passed. These use real adapter/classifier composition with a synthetic tool-free transport and isolated test HOME, no Provider or signed-client acceptance implied.

## Blockers and unknowns

Signed521.1 failure preserved; frozen521.1 will not be relabelled, installed or published. UI Settings blank observation remains unconfirmed. New build521.2/static/native/install/distribution pending; no new tag/server lock/upload. Blocked memory task count100 stays paused; business input is never replayed.

## Next step

Submit one corrected-head CI/normal merge as the existing Root owner. Keep521.1 immutable and do not import queued features.
