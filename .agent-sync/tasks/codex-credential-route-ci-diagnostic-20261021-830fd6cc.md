<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/credential-route-ci-diagnostic-20261021 -->
<!-- git-project-sync-task:base=4d1ead859d485fcba9c7cf61e45d63b9056f7751 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Expose credential route concurrency helper failures

## Objective

MOXBOTS-0516-CREDENTIAL-ROUTE-CI-20261021: retain the exact failed credential route concurrency check and make its isolated child panic observable. Existing sole desktop/updater CI owner is01a12bc2-907a-7702-b6dd-788225c5dfe4. Frozen0.5.16/build516.6 producer97aecd and signed bytes remain unchanged.

## Acceptance criteria

Keep all20 rounds,4 concurrent real helpers,15second parentdeadline and route assertions. Child panic details must reach existing inheritedstderr. No production credential/lock behavior, Reader, permission, runtime/config or package change; no test skip or timeout increase. Preserve original mainpush39570124070 failure and diagnose its underlying cause separately.

## Completed

- [x] Read original completedLinux job119121908599:1772PASS/1FAIL/8ignored; isolated round17/helper2exit101, inner panic absent.
- [x] Verified credential_slots blob9ced13542 identical onproducer97 andcurrentmain4d.
- [x] With Rust1.92 isolated generated panic probe, stdout(null)+defaultcapture hides marker onstderr; adding--nocapture exposes it, both exit101. No App/Reader or real credential operation.
- [x] Added only childharness--nocapture and explanation inside existingcfgtest code. No failure criterion changed.

## Verification

Private evidence: release-0516-20261021/owner/candidate-5166-97aecd08/{ci-mainpush-cargo-original-job.log,ci-mainpush-cargo-failure-diagnosis.json,credential-helper-output-capture-probe.json}. Exact diff and rustfmtcheck required beforepush. New automatic exact-head CI will provide observed concurrency result; a laterPASS is not proof of the original rootcause.

## Blockers and unknowns

Original isolated childexit101 cause is UNKNOWN. Do not call it infrastructure/transient or credentialroutingfixed. Actual signed-native/Applications/channel/phone/Air acceptance remain separate; no business write, native fixture or duplicate old execution dispatched. Pending native maintenance coordination authorization is tracked by the release owner.

## Next step

- [ ] Review test-onlydiff and formatting; commit/push/oneverificationPR with original failure preserved.
- [ ] Collect new exact CI and inspect exposed helper panic if it recurs; repair proven cause beforeaccepting that gate.
- [ ] Normalmain/remoteproof for accepted changes; bind verificationSHA separately from immutable5166producer97. A runtime-source repair would require a newbuild, not relabel5166.
