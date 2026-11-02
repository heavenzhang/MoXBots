<!-- git-project-sync-task:source-digest=b659feaa560712600bf329c70347f54400697c0b18d60db99b31e33e9afd79b6 -->
<!-- git-project-sync-task:id=ca72c644-c0f2-4924-af1e-584b3e1b608d -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/arm-validation-contract-r2-20261103 -->
<!-- git-project-sync-task:base=82dffd887585ffc4c416e957906ba2778da87b55 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Explicit ARM validation environment contract

## Objective

Define explicit hosted ARM and local ARM validation environments for the 0.5.38 navigation candidate, preserving every product check.

## Acceptance criteria

- Exact environment and source/lock identity fail-closed; negative tests; independent review; exact candidate CI and local native evidence; safe installation. Hosted cancellation remains recorded.

## Completed

- Original NAV source merged in main; 538.1 candidate has two hosted ARM acquisitions cancelled. Prior exact candidate local ARM supplement passed 12 product checks under Xcode27.1.

## Verification

- Source digest: `b659feaa560712600bf329c70347f54400697c0b18d60db99b31e33e9afd79b6`; node --test scripts/arm-validation-contract.test.mjs 4 passed; node --check local runner passed; git diff --check passed; exact candidate CI and full local suite pending.

- Node contract tests and diff check passed locally. Exact candidate CI and local full checklist remain pending.

## Blockers and unknowns

- The explicit local profile is separate evidence, not a successful hosted run. Independent review and source-matched actual checks remain required before candidate admission.

## Next step

- Review source-matched environment contract and checklist; verify exact SHA and run the local full checklist before deciding candidate admission.
