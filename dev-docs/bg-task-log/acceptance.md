# BG-TASK-LOG-001 acceptance

## Outcome and scope

Clicking a runtime background-task row opens a read-only status/log dialog, including when the originating tool card is absent. The former action only called scrollToTool; an absent host message caused a silent return. A second independent gap prevented logs: the old file-stat poll accepted only HOME paths and did not return log text, whereas the observed local_bash receipt refers to a system-temp .output file.

The new dialog opens immediately, shows runtime status and the latest bounded log, refreshes serially every two seconds while running, and keeps the log open after completion/failure and panel fade. Empty, missing, unavailable, and read errors have distinct feedback. Failure retains previously read text and offers refresh. Original-message navigation remains secondary and is shown only when a matching tool is in the current history. Viewing does not invoke a model, restart a command, send a message or stop a task.

## Ownership and boundaries

GET /api/session/background-task?toolUseId=… follows SessionEngine → builtin facade → existing exact Query/run registry. No client file path is accepted. Only SDK-registered paths belonging to that task and expected SDK Session are read. The reader checks canonical parents, symbolic/hard links, file type and open inode; reads at most 64 KiB from the tail; removes ANSI/control sequences; returns plain text and original byte count. Query/run replacement invalidates async reads. File existence or growth never decides terminal status.

Query finalization releases its task registry. An open dialog preserves the last successfully read log and terminal events already received, and explicitly labels retained output if a subsequent read reports a retired task. This is not a historical full-log archive. Runtimes without this capability report unavailable; synchronous tools can show their existing transcript records. No configuration/data migration or new SDK dependency.

## Evidence and acceptance

- [x] Primary inspected the actual report's SDK receipt shape without committing command/log contents. Production log reader also read the exact reported existing .output file: ready,10bytes, no truncation; raw log content not saved to evidence. This verifies file compatibility only, not the installed proxy/UI.
- [x] Backend focused suites: 297 cases across Session read route, runtime boundary, exact Query owners, full builtin transcript iterator, SessionEngine. Initial test-mock export failure corrected; original failed log kept. After filesystem hardening, 65 focused cases rerun and passed.
- [x] Primary DOM: 22 cases across task dialog and existing panel lifecycle (9 + 13), including no card, panel fade, serial polling, empty/missing/unavailable, error/recovery, abort/stale response, text safety, focus and Query-retired terminal preservation.
- [x] Independent IAB actual production React components with synthetic task/API data: no-card click, empty/missing/long, light/dark, keyboard focus cycle/Escape, delayed completion/failure/disconnect/Session switch; 390×844 and 1440×900. Final independent record: ../bg-task-log-001/ui-review.md.
- [x] Primary IAB actual click and Escape/focus restore, 390 dark long output, normal light running, preserved draft. Screenshots in task evidence folder (01-running-light.png, 02-narrow-dark-long.png, ui-review/03-wide-running.png).
- [x] Final typecheck, full lint/dependency/docs gates, MoXBots web/server builds and8production-theme checks passed using Node24.21.0. Initial full lint failed on one unused fixture import; fixed and full lint reran successfully. Existing dependency no-orphans warnings remain warnings; no dependency errors.
- [x] Primary final mixed63focused cases passed (panel/dialog/derived status, background store, i18n parity and route tests); full backend coverage above is separately recorded.
- [ ] Exact candidate normal PR CI and main containment.
- [ ] Signed desktop release and installed native actual-user-path acceptance by sole release owner.

The browser fixture uses production components and theme with synthetic data; it does not prove installed Tauri proxy or a real SDK subprocess. The backend iterator integration uses the real product event-processing path with controlled SDK messages and actual isolated files, without inference. Do not describe either as production/native acceptance.

## Reproduction

Use repository Node24 (>=24.14), npm dependencies, and Vite config `dev-docs/bg-task-log/qa/vite.config.mjs`, bound only to127.0.0.1:5273. Open the status panel and select the local_bash row. Synthetic mode buttons cover empty/missing/long data and delayed completion/failure/disconnect/Session change. Fixture CSS explicitly includes renderer sources; initial fixture omitted those sources and its visual check failed, then the corrected fixture was fully rerun.

Private generated evidence directory: /Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/bg-task-log-001-20261018. No original user log/credential/session payload is committed.

## Execution and release

Primary owns integration/frontend/final acceptance. Backend worker inherited current model settings (no model switch claimed); independent UI worker requested gpt-6-luna/medium. No external-model calls. Token/cost data not reported, no savings estimate. First full npm commands were rejected by the repository Node>=24.14 gate because the shell selected Node22; rerun uses the already-installed Node24.21.0, without bypassing the gate.

Desktop source/main and production release are separate. Existing sole owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 receives the verified PR/main record after acceptance under explicit user authorization. Target next unfrozen desktop batch; no existing frozen package/stable pointer or daily client is changed by this task. Keep running tasks and existing data; rollback is the previous supported client program, no database rollback.
