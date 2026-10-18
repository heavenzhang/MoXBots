<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-preauth-observation-20261018 -->
<!-- git-project-sync-task:base=4a329bf25d2f07027c0a946da552afe53fb876c4 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-PREAUTH-OBSERVATION-20261018

## Objective

Bounded diagnostic repair for actual P standard run39137866962 before authorization, preserving exact product23ccbded83f2b6db8042c5e6be33b74c670b4809/candidate39136956964 bytes. Canonical repository https://github.com/heavenzhang/MoXBots.git. Worker owns only browser harness/test and this task. Root reviews/dispatches/integrates; no production, journal, credentials, product edits, seed, real installation or manual CI here.

## Acceptance criteria

- [x] Read failed summary and P installer/strict bootstrap source. Actual auth requests0/seenfalse/interruptfalse/exit1/109.416s; current summary has no Node startup observation because actioncancel was excluded. Node health rollback is a source-supported hypothesis, not an observed cause.
- [x] New isolated branch from canonical4a329bf25d2f07027c0a946da552afe53fb876c4; start/task-init PASS.
- [ ] Normal integration of exact harnessa6e52392b8fda8a41a118c446f7a9baf426d89f9, then only agreed closed diagnostics.
- [ ] Extend existing bounded runtime samples to cancel, exact fixed P failure enums, fixed nofollow startup metadata; preserve all gates and output/time bounds.
- [ ] Focused offline regression: cancel sampling, no capability/name/ID/content leakage, fixed enums, no writes/seed; commit/push/handoff.

## Completed

Read-only diagnosis: unified.install invokes Host install.sh and its original doctor gate before network install/onboard. Its UnifiedInstallError is a RuntimeError and is not caught by the outer one-command handler; health failure/rollback can therefore exit without HOST_INSTALL_INCOMPLETE. Existing installed state/home UID0700 and Node HOME contract match the new strict requirements in source. Runtime skel/authority/path/unit facts remain unobserved. Bundling/log initialization and systemd sandbox differences from bare fixtures remain hypotheses only.

## Verification

No new build/install/CI/model invocation. Actual failed summary retained by root in output/host-publication-20261018/standard-P-39137866962/summary.json. Source and actual runtime evidence remain separate.

## Blockers and unknowns

No actual root cause until closed diagnostic rerun against the same P bytes. Root owns Linux acceptance, candidate/release/main. Runtime data remains private. Actual model identity/usage unknown; external models0.

## Next step

Commit this task before normally merging exacta6, implement only agreed diagnostics, then offline tests and root handoff.
