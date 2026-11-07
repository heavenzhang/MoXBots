<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/website-0544-main-closure-20261107 -->
<!-- git-project-sync-task:base=4a875324f5cb2c8aa38f86a3327bdbcd431dea06 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Close published website 544.1 download source on main without changing the desktop artifact

## Objective

WEB-DOWNLOAD-0544-5441-MAIN-CLOSURE: integrate the original website owner's published0.5.44/build544.1 download projection and exact acceptance records on actual main. Website publication remains owner01a12b99; sharedCI/main remains soleRoot01a12bc2. Desktop product source/tag/archive/native installation and updater publication stay immutable and complete. The shared CI owner also fixes the required test workload placement without changing Rust test logic or budgets.

## Acceptance criteria

- [x] Exact authora44163d7ce742b5329cc081e66b43cc98c16bdfa reviewed; publication commit22efb89e83e8bb976dc8e76a46c79183483d6bf6 differs from final author only in task/plan evidence.
- [x] Actual three public static readback SHA/size values equal accepted Git bytes; original JS/CSS and desktop product/version paths unchanged; required Linux Rust workload isolation is described below.
- [x] Root23website tests PASS on the same exact website input bytes; no assertion/negative scope weakened. Production normalTLS three-file readback/16routes/backup/owned CAS verified through original owner receipts.
- [x] Keep desktop documentation PR263 at its separately green sourcec7; normally merged to4a875324f5cb2c8aa38f86a3327bdbcd431dea06 with exact tested tree, no successor push or canceledARM job.
- [ ] New exact website source automaticCI, fresh main/tested whole-tree admission, normal merge and remote proof; existing automatic mainpush collected without a duplicate dispatcher.
- [x] No new desktop build/sign/Apple/archive/install, updater publication, tag/version mutation or Root website deployment. Browser visual remains explicitly unclaimed.

## Completed

Root preserved the initially local combined website preparation as c0c86f832c3d9b8ad91bfbaf348a13763ae3f664 on codex/website-0544-closeout-preparation-20261107 without pushing it toPR263, resetting or dropping any edit. That local merge resolved only the shared-plan append by preserving both full sections. This new clean branch began at actual main4a875, before task initialization, then normally merged the preserved preparation; authora441 is a Git ancestor, not a silent file copy.

## Verification

Root website source and deployed-byte provenance review: work/bot-care-root-intake-20261107/owner/metadata-closeout/website-source-review.json. Root node --test services/website/download.test.mjs23/23PASS and git diff --checkPASS; all website source/test input bytes remain equal to that exact tested preparation. Original owner23/23PASS/normalTLS readback/16route regression and publication receipts: output/website-download-0544-20261107/. Reuse Root fullGET302348336bytes SHA256e305db5708c6bd56a213e51139d01c2e02f6072a3a4e342c6ea2870dea2a3eec and production signature; no repeat whole archive download or package pipeline.

Desktop release remains source0caae7bcbdd950935dd5b80074c0b4f56a9d331e/tagv0.5.44/release-mainf676255050e8210c9f913afae86ecf70dd986a72. Original native/currentversion/retention and reviewed draft/Cuse limits are unchanged. Website current target20261107-web0544-1f999e8288f4, treeSHA2561f999e8288f48262cab8d65a2ce7c9f853c7038478ec98331b65313d98de64fc; old0542target/backup retained. Root does not touch website locks/Nginx/TLS/cloud/mobile/Host or user UI.

## Blockers and unknowns

No blocking source or publication finding. Exact websiteCI/main is still required. Desktop metadata mainpush42348137829 is an existing independent run and must reach terminal before another main merge so it is not canceled. Real browser visual was unavailable; no Chrome/Work bypass or visualPASS claimed. Other unreviewed queues remain outside this finite source closure.

## Next step

Commit/push this explicit source closure once, run exact project-sync handoff, create one normal PR and collect its automaticCI. After actual all required checks and prior mainpush terminal, fresh main/tested-tree admission precedes one normal merge, remote proof and final existing mainpush collection. No deployment repeats.


## R1 failure and required CI workload isolation

R1 Test42348424586 finished8success/1Rustfailure/iOSconditional skip, all terminal. The original Rust log is preserved privately:446035bytes SHA25615795f16bc098e2fe8d77ccf6c1d9ccb1b00e6dcc8fa7894e291a35ccfc10091. Rust1841passed/1failed/8ignored. The unchanged real_process_commits_serialize_without_losing_routes stress case reached round185 when its cumulative120second diagnostic budget expired (the round end is min(globalend, now+15seconds)); no route-loss assertion failed. The Rust source blob is identical to passing desktop main4a875. This is a required CI failure, never treated as PASS or silently retried.

R2 changes only CI workload orchestration and its regression tests: verify the exact stress case is present once, run all remaining Rust targets, then run the exact unchanged stress case as a mandatory isolated invocation. All200rounds, four real concurrent processes per round,120second total/15second round limits and every assertion remain unchanged. Discovery/other-suite/stress failure stops nonzero; there is no continue-on-error, optional gate, timeout increase, test removal or rerun. Existing profile and strictclippy steps remain. Root13orchestration+ARMcontract checks, classification and YAML parse pass; actual new-source Linux test execution and completeCI still remain required. Local default build-script pool separately hit unchanged mock-worker/toolchain time bounds; original log remains, same full372case pool was validated serially with original limits:358PASS/14existingplatformskip/0fail, not weakened source.


## R3 formatting-only follow-up

R2 JS gate rejected one no-regex-spaces style error in the newly added orchestration test: ten literal spaces are now expressed as the identical {10} quantifier. Root acknowledges the omitted local scoped lint before R2; no rule was suppressed. Scoped ESLint and complete npm run lint (dependency and agent-doc checks included),13orchestration/ARMcontract cases and whitespace nowPASS. No workflow, original Rust test, bound or production byte changes relative to R2. The original JS log is retained privately. R3 may be committed locally while R2 runs, but will receive one normal FFpush only after all actual R2 jobs, includingARM, are terminal; old sourceCI results never substitute for the new exacthead.
