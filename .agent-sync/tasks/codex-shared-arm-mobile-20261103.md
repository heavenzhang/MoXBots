<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/shared-arm-admission-mobile-20261103 -->
<!-- git-project-sync-task:base=186f88dc942607ddb5e58db158b294c37f0ad83d -->
<!-- git-project-sync-task:status=in-progress -->

# MOBILE-WORKFLOW-RELEASE-20261103 — shared ARM admission scope

## Objective

Allow the existing, narrowly bounded local ARM evidence process for the same shared macOS CI check on mobile candidates. Shared CI and main remain owned by session 01a12bc2-907a-7702-b6dd-788225c5dfe4; mobile build, signing and device installation remain with session 01a12b99-7b38-78b1-831f-9c60257d386a. No desktop deployment is requested by this change.

## Acceptance criteria

- [x] Preserve the original hosted capacity-cancellation evidence and the earlier candidate's 12 local results without claiming hosted success.
- [x] Prepare a narrowly scoped documentation change without altering product checks, security controls or mobile acceptance gates.
- [ ] A non-implementer reviews the exact rule change and evidence.
- [ ] Coordinate a single updated candidate and its exact-source CI, local ARM evidence, admission and verified main integration.
- [ ] Hand exact main and evidence to the existing mobile owner for their build and device acceptance.

## Verification and next step

Earlier source 63a6cccd10d6fdc0ba546add4c181b10f3f290b2 had eight successful checks, a conditional iOS skip, and a macOS job cancelled before runner allocation with capacity annotations. Its independent local ARM run completed 12 steps with verified log hashes; these results do not constitute CI evidence for a changed candidate. Documentation diff whitespace check passed. Obtain independent review before updating the candidate; rerun evidence for the new SHA and retain the original record.
