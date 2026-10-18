<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0511-delivery-20261018 -->
<!-- git-project-sync-task:base=ffaf0005aedf88df49e127781020948bdb8cebe1 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-LOGIN-FIX-0511-20261018 final release delivery

## Objective

Deliver the exact signed/notarized 0.5.11 login patch through the existing macOS arm64 own updater, preserve running tasks/identity/data and retain real acceptance boundaries. Source was already merged by PR #125; this branch changes delivery records only.

## Acceptance criteria / To Do

- [x] Freeze source/tag `15be9d6fda17c464afa54ee675d10f1d7fd4507f` / `v0.5.11`; preserve later main changes outside binary.
- [x] Verify exact signed/notarized app, archive, production updater signature and Reader.
- [x] Authorized current-Mac idle/backup QA: real website-to-desktop continuation, baseline cold restart, original identity and authenticated read.
- [x] Independent current native UI/package acceptance; explicit history/source provenance limits.
- [x] Independent static publication-script review; exact baseline/lock/rollback and normal TLS gates.
- [x] Immutable upload, full external GET/stat/hash and independent original-evidence review.
- [x] Atomic stable promotion, public Range/hidden/unsupported verification, independent postpublication check and own-lock finish.
- Normal PR/CI/main integration and remote containment are tracked by the actual PR and canonical Git refs; do not embed a self-referential delivery SHA in this file.

## Completed

See `dev-docs/releases/moxbots-0.5.11.md` for package hashes, notarization, actual native paths and limits. Current daily on-disk application remains0.5.9; exact0.5.11 candidate ran from temp during human-authorized maintenance QA. No model/remote business execution or new credentials recorded in Git.

## Verification

- Project sync start and task-init passed against the explicit user-supplied repository and exact base.
- Stage receipt proved full transferred hash/size and unchanged baseline. Complete external GET, original-evidence independent review, Root audit, promotion, 9-route public checks, independent postcheck and finish all passed; exact proof hashes are in the release note.
- New release/task and updated original task pass targeted Prettier; shared plan/handoff had baseline formatting differences, so no broad formatting rewrite.
- `git diff --check` passed; no product source changes in this delivery branch.

## Blockers and unknowns

No missing user credential or VM gate remains. Distribution is complete, stable0.5.11 verified and task-owned lock released. Do not rerun stage/start/collect/promote/publiccheck or overwrite this version. Network discovery had transient timeouts before baseline recovery. RemoteHost configuration/model/Windows/updater A-to-B install remain unaccepted outside this scoped login/distribution evidence.

## Next step

Commit only this task/release/plan/handoff set, synchronize latest main, and perform normal PR/sixCI/main delivery with remote containment verification. Record the resulting PR/main SHA in the private final receipt. Binary frozen source remains15be9d6f regardless of documentation merge SHA.
