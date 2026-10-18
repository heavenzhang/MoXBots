<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/updater-resume-20261018 -->
<!-- git-project-sync-task:base=118cabbbc9a7c76c771e764e12ab0e8f77877a44 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-UPDATER-RESUME-20261018

## Objective

Fix interrupted update downloads with persistent partial files, bounded retries and resume; show progress and persistent failure details with an explicit retry action. Preserve active tasks, credentials and the daily app. Remote main delivery is required. Desktop packaging/publishing remains serialized by the existing release owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`; this development chat does not publish or restart the daily app.

## Acceptance criteria / To Do

- [x] Verify repository, current main, isolated worktree and original failure evidence.
- [ ] Stream partial bytes to disk, bind resume identity to the manifest, strictly validate HTTP ranges, preserve partial across retries/restart.
- [ ] Retry transient failures with bounded backoff; surface readable terminal failure and retained bytes; allow manual retry.
- [ ] Require exact package signature before ready/pending; corrupted/changed responses must fail closed.
- [ ] Expose one Rust download snapshot/event; show percent, bytes, rate, retry state and persistent error in About.
- [ ] Focused deterministic Rust loopback interruption/range/signature tests, renderer state/DOM tests, type/lint and web build.
- [ ] Independent running UI review at desktop and narrow widths; root reviews integrated patch and critical paths.
- [ ] Normal PR/CI/main delivery; verify remote main contains change.
- [ ] Queue signed native release and real A-to-B/active-task protection checks with existing release owner; no interruption of active tasks.

## Scope and interfaces

Rust updater remains the sole update authority, with a `updater:download-state` full snapshot and `get_update_download_state` command. State has monotonically increasing revision; idle/checking/downloading/retrying/failed/ready phases, version/bytes/total/percent/rate, attempt/backoff and safe failure code/detail. Existing install admission and explicit restart confirmation remain unchanged. No new service, port, dependency or production mutation.

## Execution / owners

- Root: requirements, interface, server read-only diagnosis, tests/integration, Git and release handoff.
- `download_backend`: Rust updater/partial transport + tests; requested gpt-6.1-sol/high because resume integrity and signature safety are consequential.
- `download_ui`: hook/About progress and retry + tests; requested gpt-6-luna/medium, established UI.
- Independent UI/source acceptance will be scheduled after implementation. Requested model settings are not a claim about billing or measured savings; runtime token/cost data unavailable.

## Completed / evidence

Original installed 0.5.9 discovered stable0.5.11; download reached76% then body-read failure, later manual attempts failed and metadata request timed out. Bounded current range probes also stalled. Private diagnostic evidence remains outside Git under the workspace output/updater-diagnostic-20261018/. Source main base `118cabbbc9a7c76c771e764e12ab0e8f77877a44`; start gate passed.

## Verification and delivery state

Code: in progress. Simulation/loopback: pending. Real server: read-only diagnostic pending. UI review: pending. Main: pending. Signed native production: not yet released or accepted; live app/tasks untouched. No credentials or private user records in this task.

## Next step

Integrate backend and UI against the snapshot contract, run deterministic failure/resume cases, then normal CI/main delivery. Real signed package and A-to-B acceptance require the existing serialized release lane and an idle-task gate; do not substitute local mock evidence for native production acceptance.
