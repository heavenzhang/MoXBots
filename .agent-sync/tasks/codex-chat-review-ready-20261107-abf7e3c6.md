<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-review-ready-20261107 -->
<!-- git-project-sync-task:base=a650939d2c38b8dc04750e282b159ddaac8ea346 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: CHAT08 reload unknown review on native session readiness

## Objective

CHAT08-COLD: repair the native543.4 finding where an initial read409 during cold prewarm never refreshes when the original SDK becomes ready. Read-only display wakeup on the existing scoped chat:status stream; keep original review and operation authority unchanged. Existing desktop/sharedCI/main owner01a12bc2-907a-7702-b6dd-788225c5dfe4 remains sole release owner.

## Acceptance criteria

- [x] Reproduce failed initial read plus unchanged history; current backend readiness refreshes once, including response/event race; foreign/duplicate status does not refresh.
- [x] Current ready Query read revision matches original owner; not-ready/replaced Query remains unavailable, no operation dispatch or ledger writes.
- [x] 168DOM +20 integration, complete typecheck/scoped lint/classification pass.
- [ ] Exact source push and handoff to existing owner.
- [ ] Next installed candidate proves original unknown sample visible/reopen; then real approval and reading gates, main/publication separately tracked.

## Completed

- Original source23d98 and reading1921 are in maina650 viaPR259 and installed543.4; native unknown replay failed due cold-read timing. Frozen candidate remains immutable.
- New isolated branch from exact maina650; lifecycle status carries opaque review revision after actual parked ready Query. Tab consumes exact Session hints; Chat refreshes existing reviewer without polling or sending.

## Verification

- RED: actual TabProvider + RecoveryActionReview stays at one inspect after readiness event on old code. Log in private work area; no real user data in fixtures.
- GREEN: response/readiness order, no duplicates/foreign Session, unknown card visible; 168DOM/20integration/type/lint/classification PASS. Evidence dev-docs/chat-review-ready-20261107/acceptance.md and evidence.json.

## Blockers and unknowns

- Native verification requires owner's next immutable package. Source tests are synthetic and do not close native gates. New-dialog initial-send issue belongs to existing separate producer; do not overlap.

## Next step

Finish affected validation, commit/push exact source, hand to sole desktop owner for next batch and N02 original sample read-only validation; no replay/clear or competing CI/build/install.
