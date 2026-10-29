<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-build6-main-20261029 -->
<!-- git-project-sync-task:base=4977779c196ab96e950cc3eb307ae584bef1b72b -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-MOBILE6-MAIN-CLOSURE-20261029: preserve exact installed mobile6 source on main

## Objective

Preserve the already installed mobile0.1.0/build6 producer1a6593d4dec3e2b5afeffbdc74512230dc1cbd64 on currentmain without importing the whole cloud branch. Root01a12bc2 remains sharedCI/main owner; mobile signing/device/TestFlight stays with01a12b99. Desktop0.5.27/build527.3 delivered at main4977779c196ab96e950cc3eb307ae584bef1b72b/tagv0.5.27 remains immutable.

## Acceptance criteria

- [x] Exactauthorbranch2eed verified; onlyfourmobilefile netdelta: buildNumber5->6 and generated/native defaultorigins140->101. Existingorigin-scoped secure records are not relabeled.
- [x] Integratedmobile subtree equals originalproducer1a6593d4; no other productdelta.
- [x] Affectedmobilepolicy84/84/type/lint PASS.
- [ ] One automatic exact-head PRCI allrequired actualPASS.
- [ ] Freshmain/ancestor/testedtree normalmerge and remoteverification; originalmobileowner handoff with evidencebounds.

## Completed

Cleanfreshmain497 isolated Rootintegration branch; project-sync start/task-init PASS beforeedits. Fourfile exactbytes copied from2eed and independently identical1aproducer. No originalauthor workspace/derived/device changes, mobilebuild/sign calls0, desktoppipeline calls0.

## Verification

Rootaffectedlocal checks:84policy/0fail/0skip, tsc andExpoESLint exit0; wholemobile workingtree diffagainst original1aproducer empty. Logs bound in privatepointer work/mobile6-main-closure-20261029/owner/local-checks-review.json. ExactheadCI pending. Originalauthor84policy/type/lint/native slices/archive/signature/installedbuild6 and humanSessionlist are supporting historicalevidence; not a currenthead CI or phone businessacceptance claim.

## Blockers and unknowns

Physicalphone send/receive/attachments/preview/download/TestFlight remain originalmobileowner gates. Cloudbrowser human-deferred. ExistingfourRust controller fix alreadymain and exactLinuxartifact handed off; actual finiteprotocolQA remains originalowner. Mainhandoff and installedphone outcomes are separate.

## Next step

Prove exactmobile subtree, runaffectedchecks, commit/push handoff then oneautomaticPRCI. AfterrequiredPASS normalmerge/remoteverify; do not allocate desktopversion or rebuild phone.
