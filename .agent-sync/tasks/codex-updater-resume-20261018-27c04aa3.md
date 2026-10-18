<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/updater-resume-20261018 -->
<!-- git-project-sync-task:base=118cabbbc9a7c76c771e764e12ab0e8f77877a44 -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-UPDATER-RESUME-20261018

## Objective

Fix interrupted update downloads with persistent partial files, bounded retries and resume; show progress and persistent failure details with an explicit retry action. Preserve active tasks, credentials and the daily app. Remote main delivery is required. Desktop packaging/publishing remains serialized by the existing release owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`; this development chat does not publish or restart the daily app.

## Acceptance criteria / To Do

- [x] Verify repository, current main, isolated worktree and original failure evidence.
- [x] Stream partial bytes to disk, bind resume identity to the manifest, strictly validate HTTP ranges, preserve partial across retries/restart.
- [x] Retry transient failures with bounded backoff; surface readable terminal failure and retained bytes; allow manual retry.
- [x] Require exact package signature before ready/pending; corrupted/changed responses must fail closed.
- [x] Expose one Rust download snapshot/event; show percent, bytes, rate, retry state and persistent error in About.
- [x]11 isolated native product-module Rust tests,22 updater/confirmation DOM +15 Settings/Linux tests, TypeScript, changed-source ESLint and production Web build passed. Full CI remains separate.
- [x] Root running UI review at desktop and narrow widths; 12 Chromium cases and screenshot inspection. Independent worker could not execute after usage limit; independence is not claimed.
- [ ] Normal PR/CI/main delivery; verify remote main contains change.
- [x] Queue signed native release and real A-to-B/active-task protection checks with existing release owner; no interruption of active tasks.

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

Code: implemented. Focused renderer:22 updater/confirmation +15 Settings/Linux tests passed. TypeScript, changed-source ESLint and production Web build passed. Root Chromium actual extracted About JSX:12 cases passed at1200×900/390×844, zero page errors; snapshots in dev-docs/updater-resume/qa/. Rust transport loopback:11 native macOS arm64 actual-module tests passed; latest full CI still pending; earlier CI compiled product but found test fixture length mismatch (34 bytes vs hardcoded32), corrected. Main authority is PR138; merge/remote containment must be verified. Signed native production: not released or accepted; live app/tasks untouched. No credentials or private user records in this task.

## Next step

Integrate backend and UI against the snapshot contract, run deterministic failure/resume cases, then normal CI/main delivery. Real signed package and A-to-B acceptance require the existing serialized release lane and an idle-task gate; do not substitute local mock evidence for native production acceptance.

## User-authorized release notification

User explicitly selected “授权通知并安排发布” in this chat. Existing publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4` was actually notified with PR138/stage source, verified frontend results and native/main gates; it acknowledged queueing for the next unfrozen release, awaiting final main/CI receipt. No stable switch or original-task interruption authorized by this notification. Already installed0.5.9 still needs reliable full bootstrap download and an idle/backup/install-confirmation gate before it gains resume support.

Final local transport evidence: `dev-docs/updater-resume/transport-results.json`, real product module compiled via an isolated harness without launching Tauri. Accepted socket nonblocking inheritance on macOS was corrected in the test fixture, and the unchanged signed sample length is dynamically derived. Source, frontend and partial integrity accepted locally; main and signed native installation remain separate gates. No active user task was interrupted.

## Blockers and unknowns

Latest required PR138 CI and normal main merge are still open. Existing release owner has acknowledged queueing but signed native A-to-B installation, actual old-client bootstrap transfer and busy-task native acceptance remain unperformed. This development chat must not switch production stable or restart daily work. Independent UI execution was unavailable after worker usage limits; root-owned browser/visual verification is recorded as self-review. The precise network hop responsible for the original long-response disconnect remains unidentified; resilient transport is verified independently.
