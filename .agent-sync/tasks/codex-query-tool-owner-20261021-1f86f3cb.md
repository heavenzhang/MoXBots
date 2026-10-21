<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/query-tool-owner-20261021 -->
<!-- git-project-sync-task:base=2adf5c1d22c138d1b1c5022acc0bfd0179a78012 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Preserve exact delivered foreground tool admission across background start

## Objective

Describe the user-visible outcome and scope.

## Acceptance criteria

- State observable completion conditions.

## Completed

- Record committed results, not intentions.

## Verification

- Record commands and outcomes tied to the current branch.

## Blockers and unknowns

- Record unresolved ownership, environment, authorization, or validation gaps.

## Next step

- Give the next agent one concrete starting action.

## Delivery contract
Task MOXBOTS-QUERY-TOOL-OWNER-20261021. Scope: exact main SDK hook + healthy delivered foreground request can keep its existing tool admission when unrelated prior root failed and a new background task starts. Never clear old request fences, grant another inference, infer background ownership, replay completed/uncertain writes, or change permission modes. Root sole implementation/integration/publisher; zero workers because ownership logic is tightly coupled. No AIRouter or model switch used.

## To Do
- [x] Read-only original e181 timeline; source mechanism reproduced with zero actions/network. Original runtime root causality remains unproven.
- [x] RED/GREEN exact native owner tests and replay/Stop/changed identity negatives (12 focused cases).
- [ ] Primary review, relevant regression, type/lint, source commit/push and normal main CI.
- [ ] New immutable candidate and signed native verification before formal promotion. Frozen5165 Air candidate remains unchanged.

## Completed
Synthetic repro and new source branch from verified main2adf. No business Session or credentials mutated.

## Next
Prove a narrowly bound tool receipt exception without loosening unknown-background or same-root blocked admission.

## Current limitation and next decision
The proposed exact delivered-tool exception passes 187 relevant unit cases and 86 loopback integration cases, TypeScript and scoped lint. It repairs the isolated tool-admission symptom but DOES NOT disambiguate the next HTTP inference while native background work exists. QueryRequestGuard.begin still intentionally fences unknown/background request ownership against prior failed roots. Therefore this branch is an EXPERIMENTAL PARTIAL FIX, not eligible for main/release/native acceptance. Do not claim the real original e181 root cause is proven or all409 fixed. A correct complete resolution needs authenticated request-to-native-root/agent ownership, or a safe natural Query retirement at the existing idle/background-settlement boundary; do not remove old request fingerprints or permit ambiguous automatic inference. The live original business is untouched.

Candidate5165/source0a40 remains immutable; Air login candidate proceeds independently. No new build/version/CI dispatch/PR/tag/Applications/stable operation from this branch.
