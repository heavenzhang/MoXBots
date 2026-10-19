# MoXBots 0.5.13 stability release

Task: `MOXBOTS-0513-STABILITY-RELEASE-20261019`. Sole desktop integration/publisher: `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Canonical repository: https://github.com/heavenzhang/MoXBots.git, `main`.

The human directly requested unified0.5.13 because ordinary tasks were not reliably completing. This supersedes the unpublished0.5.12 release; its frozen source and signed candidates remain sealed and are never relabelled. Existing authorization covers safe-idle maintenance, backup/rollback, actual model acceptance, publication and final `/Applications` replacement. Active or unknown business work is preserved.

## Source scope

Base main `23efc8777c5e9fbffc2551a94814a6ec84936dc2` includes all accepted0.5.12 source (PR143/maina766) plus PR151 persistent model recovery (`9f48ae73d795af58f04049ee97e8896884fea066`). Exact source heads additionally integrated:

| PR | Head | Behavior |
| --- | --- | --- |
|146|`b248f4e1d2ae3de109b7f074a3f3f3c9f005ad60`|Persistent in-chat subagent entry/report, loaded history, factual lifecycle and model display|
|147|`94d4a702efd5d724c63921dd9512102c5981104d`|Cached history/draft/scroll retained; display-only cold preview before live restoration|
|148|`dfb984daa4910f062fd4993119ead9e50810d15b`|Stable sidebar project positions while preserving pin/manual order|

All product changes merged without textual conflict. Appended shared-plan conflicts retain both records. PR151 server/bridge/SessionStore recovery and original updater Stop/terminal settlement are unchanged by this frontend combination. PR104's seven final file blobs match PR109 source `81d55b54118cb1a0f771c0585a10a5e368f24bd5`, which is already an accepted main ancestor (merge `5f9df60445fdb3b5a4271c28eeecbbcc7f6fa1f0`); do not duplicate it. The earlier precursor549a is not a main ancestor and is not used as containment proof. Later Task localization improvements are retained. Mobile/Host/service PR129/136/137 and another owner's uncommitted team-mode work are outside this desktop release lane.

Version0.5.13 is synchronized across package/lock, both Tauri configs, App and Document Worker Cargo manifests, and the App Cargo.lock entry. No dependency update. Preview-only repairs supply the missing Vite React preamble and TabContext tabId, plus a theme control; these do not enter the production renderer entry.

## Joint verification

- 371 tests across13 affected frontend DOM/unit files passed, including cache/preview authority, lifecycle/continuation, subagent state, background run identity, sidebar and task card projection. Another43 tests across original status/ToDo/background-log files passed. Version synchronization3 tests passed.
- Full typecheck and lint passed; dependency guard0errors with existing warnings. MoXBots-profile Web production build, license contract and8theme checks passed. The first build correctly refused the stale0.5.12 Cargo.lock package entry; the entry was synchronized, then the build passed. Original failure log retained.
- Root, a nonimplementer of the incoming UI features, used the actual components and actual full App in background IAB with controlled synthetic transport/storage. Component checks: running→returned, persistent access, current/history, report/task/progress/tools, keyboard tab navigation/Escape/focus wrap, draft preservation and800px dark layout.
- Full App: history readable before SSE open while execution remains fenced; connected subagent inspector hides but retains the mounted workspace, close restores it. A→B→A retains exact Tab identity, draft and scroll1874→1874. Actual800px light modal layout and close verified. Native-only directory operations are unavailable in this browser fixture and are not accepted by it. Browser fixture diagnostics and screenshots are retained privately.
- These are synthetic UI/transport checks, not signed native or external real Provider acceptance. Incoming PR151's actual SDK loopback/CI evidence remains distinct from real Provider and production claims.

Private original evidence: pointer workspace `work/release-0513-20261019/owner/` (unit/DOM/type/lint/Web logs, IAB screenshots/AX and controlled server source). Daily0.5.11 diagnostic prefixes show499/503 and reconnect errors; they establish observed failures, not a proven universal root cause or proof of0.5.13 repair. No private conversation, secret, business log, database or binary is committed.

## Open delivery gates

- [ ] Exact union head normal full CI/review/main merge and remote SHA/tree/ancestry verification.
- [ ] Clean frozen source and new signed/notarized/stapled0513 candidate, fixed Reader, archive readback/updater signature.
- [ ] Fresh authoritative idle/durable generation, whole maintenance-window schedule horizon, consistent backup/rollback. Latest screenshot attempt found the Mac locked; activity remains unknown and no quit/install occurred.
- [ ] Signed native complete task, ordinary/Goal real-model recovery, pause/Stop/cancel persistence, no uncertain replay, updater Goal/Cron settlement/private A→B and necessary UI acceptance.
- [ ] Owned updater stage/unique normal-TLS external full GET/original audit/atomic promote/postcheck/finish, then authorized daily installation and real path/task verification.
- [ ] Final release/download/rollback/boundary records through normal PR/CI/main with actual remote SHA; stop continuation automation after delivery.

Published stable0.5.11 is preserved. This record does not declare0.5.13 published or the daily client upgraded.

Execution: Root serial integration/review/release; zero new workers, retaining the prior worker restriction. No external model call during this source preparation. Token/cost savings are unknown. Early actual rendering exposed two broken fixture assumptions before merge; production-path acceptance stays separate from fixture success.
