<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-native-records-20261107 -->
<!-- git-project-sync-task:base=a650939d2c38b8dc04750e282b159ddaac8ea346 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: CHAT08 read native records without requiring a session summary

## Objective

CHAT08-RECORDS: repair native543.5 N02 failure where SDK can resolve history, but summary-free sessions yield no getSessionInfo and the evidence reader incorrectly refuses raw records. Keep selected-chain proof, collector scope and resource caps, all execution/ledger guards. Sole desktop/main/sharedCI owner01a12bc2 remains responsible for next immutable build and native gates.

## Acceptance criteria

- [x] RED missing summary with valid SDK raw records; GREEN bounded exact SDK collector, missing/foreign/oversized/empty fail closed.
- [x] 113unit/33integration, complete typecheck/scopedlint/classification and read-only original ledger+V2 projection pass; no business operation or data edit.
- [ ] Push exact source and hand to existing owner; original543.5 unchanged.
- [ ] Next native unknown/approval/read gates pass before main/publication.

## Completed

- Isolated from maina650; frozen543.5 remains installed and unmodified. Offline exact SDK reads12 selected rows but summary undefined; oldhelper returnssource_unavailable in1ms. Public SDKimport collects36 original records101305bytes and exact originaltool present in selected/raw; original ledger digest unchanged. These are read-only diagnoses, not native UI acceptance.

## Verification

RED→GREEN and all affected checks PASS; evidence dev-docs/chat-native-records-20261107/acceptance.md and evidence.json. Private diagnostics work/MB-CHAT-STYLE-20261104/diagnose-5435.

## Blockers and unknowns

543.5 N02 failed; N03 and long native reading gates remain open. Source69f4 cold readiness is in frozenPR260 but not main; this source only repairs raw reader, owner composes both. No competing CI/build/install or public publication.

## Next step

Finish evidence reader regression, push exact source to sole owner, next immutable candidate, original N02 first; preserve all original attempts, no repeat/clear.
