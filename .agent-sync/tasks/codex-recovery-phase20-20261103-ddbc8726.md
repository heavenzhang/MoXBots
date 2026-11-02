<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/recovery-phase20-20261103 -->
<!-- git-project-sync-task:base=c79dd55dd2d7feb55bf1590f41194917fff05d71 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Recover invalid intent admission without replacing the original execution

## Objective

Continue MB-RECOVERY-INCIDENT-20261101 after installed 0.5.39/539.1 failed original-session acceptance. Recover malformed tool-free intent classification without silently turning authorized work into a read-only model turn. Preserve existing execution identity, progress and exact unknown-operation fences. Investigate the separate temporary-review replacement of the paused salary execution before claiming recovery.

## Acceptance criteria and To Do

- [x] Verify canonical main, isolated branch and sole release owner.
- [x] Preserve native failure evidence: Max invalid_json; salary current execution replaced by a new review execution.
- [x] Reproduce malformed intent and recovery/cancellation/limit boundaries in isolated tests (five initial failures, corrected within the original total budget).
- [x] Implement bounded validated intent recovery and explicit admission failure, including exact structured pre-dispatch evidence in the existing UI failure path.
- [x] Future temporary inspections preserve original execution/evidence/review/plan; explicit later work retains normal permission checks.
- [ ] Previously overwritten salary execution requires separately reviewed recovery from original evidence; this patch does not silently rewrite production metadata.
- [x] Test actual relevant runtime boundaries, types, lint and regressions using isolated synthetic runtime/provider inputs.
- [ ] Commit, push and exact handoff; original owner reviews and integrates remote main.
- [ ] Owner allocates a new immutable candidate, runs shared CI/build/sign/install, then original-session acceptance.

## Ownership and scope

Root 01a182ef-86eb-76b2-a2ee-2eae68ea7339 owns source diagnosis and this branch. Desktop/shared CI/main/version/build/install/native validation remain exclusively 01a12bc2-907a-7702-b6dd-788225c5dfe4. No cloud, website or Host deployment. No production ledger edits, session recreation or replay of unknown business operations. No version allocation or CI dispatch from this branch.

## Completed

Implemented and locally verified bounded intent recovery, pre-dispatch failure handling, and explicit temporary-inspection preservation. Source and tests are committed on this task branch. Main integration, the new artifact and actual native acceptance remain with the original release owner.

## Verification

Node24 start/task-init PASS at base c79dd55dd2d7feb55bf1590f41194917fff05d71. Six related unit/integration files: 520 PASS. After final read-only bookkeeping gate, execution integration 100 PASS and full TabProvider activity DOM 138 PASS. Added actual facade/SDK synthetic inspection path: 1 PASS, including durable original execution readback. Distinct covered tests: 659. Intent utility focused set 21 PASS includes auto/manual, disabled pool, transport/output fallback, cancellation, model-mode change and common 60s deadline. Typecheck, scoped lint, test classification and diff checks PASS. No real paid provider calls or production data writes.

Private logs: incident evidence/phase20-{intent-before,intent-after,final-tests,final-dom-execution,native-inspection2,tsc-delivery,lint-delivery,classification}.log. Actual installed 539.1 original-session acceptance failed and remains separate. A first added persistence test used the process-shutdown drain before a live metadata read; corrected the harness to flush the active writer and independently read the disk index, retaining the original failing log.

## Blockers and unknowns

The malformed classifier response was not recorded by 539.1, so its exact text is unknown. Current selected classifier configuration alone cannot prove the response content. Salary business authorization and task evidence ownership are separate from classifier failure. Auto mode persisted for Max and scroll, but enabled pool membership is not health proof.

## Next step

Original desktop owner independently reviews exact source, integrates main and assigns a new immutable candidate. Preserve installed 539.1 and old salary evidence until that coordinated maintenance; root prepares bounded historical restoration separately. No stable-publication or original-task-completion claim.
