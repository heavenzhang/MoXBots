<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0520-updater-stall-fixture-20261023 -->
<!-- git-project-sync-task:base=6c30c2f94f76589a9856c20bc368ec0ee5479678 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: Hold the stalled updater test body until client timeout

## Objective

Remove the fixed60ms server-close race in the updater timeout fixture. Scope is cfg(test) only; the signed0.5.20/build520.1 production artifact stays frozen at6c30c2f94f76589a9856c20bc368ec0ee5479678.

## Acceptance criteria

- Preserve timeout25ms, exactly2retries, less-than1second download, and nonempty partial-file assertions.
- Keep the incomplete body open until the client abandons it; existing socket read timeout bounds the fixture. Join without blocking the current-thread Tokio reactor so response cancellation can drain.
- Original failure preserved, targeted real transport probes pass, full new-head CI passes before normal main merge.

## Completed

Only stalled_body_times_out_with_bounded_retry_and_preserves_file changed under cfg(test). Production prefix is byte identical. No scheduler/provider/runtime implementation changes, no new package rebuild or Apple submission.

## Verification

Original main-push CI39979152231 Rust job120501542694:1806passed/1failed/8ignored; expected timeout, got network. OriginalPR196 CI39976278523 passed9success/conditional iOSskip. Raw failure retained by release owner.

Independent native reqwest0.13.2/Tokio1.51.1 loopback probe: deliberate90ms delayed polling with a separate reactor worker reproduces original network-vs-timeout; revised held-body fixture passes with the same assertions. All11 copied transport tests pass without injection. Production prefix SHA2560eb99f5a9d21e020be9dca1949e795f81877bf4b52e78a553e40ebb01bbb43fc unchanged. rustfmt completed. The historical GitHub scheduling cause is inferred, not directly observed; probe is not signed native UI or Provider acceptance.

Raw local evidence: work/release-0520-20261023/owner/updater-stall-fixture-root-review.json and fixture-probe-r2-old-delayed-r2.log / fixture-probe-r4-new-delayed-r2.log / fixture-probe-r4-new-native.log in the owner's local release workspace. Probe setup errors and their corrections are preserved.

## Blockers and unknowns

New corrective PR CI and protected normal merge remain outstanding. Native plan-card acceptance, local install, and online promotion remain separate gates under Root01a12bc2-907a-7702-b6dd-788225c5dfe4. No external deployment by this test fix.

## Next step

Run the automatic new-head PR CI, normal merge after green, verify remote ancestor and cfg(test)-only closure against the frozen520.1 source. Resume the same existing artifact without rebuilding.
