<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-ui-smooth-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: REMOTE-UI-SMOOTH-20261024 — smoother remote snapshot presentation

## Objective

REMOTE-UI-SMOOTH-20261024 continues REMOTE-UI-20261020: make observed remote output and local interaction smoother using the existing snapshot transport and ordinary conversation renderer. No new protocol, SSE owner, optimistic tokens or execution authority.

## Acceptance criteria / To Do

- [x] Verify latest canonical source, clean isolated branch and existing publisher ownership.
- [x] Running foreground reads wait300ms after completion; idle1500ms, background5000ms. Sequential wakeups coalesce, errors back off to15s; no mutation retry.
- [x] Identical snapshots preserve transcript array identity; changing real text retains unchanged tool blocks. Updates remain visible, stale generation/account completions and uncertain receipts retain existing fences.
- [x] Unchanged fast reads do not broadcast App-wide sidebar changes within the displayed successful-sync minute.
- [x] Focused unit/DOM regression: 41 cases in 7 files; affected ESLint, full TypeScript check, test classification and diff whitespace checks pass.
- [x] Independent actual-component browser checks: Chromium and WebKit, 24 remote/ordinary cases in total; scroll/prepend/new output anchor, fold/draft, 390/800/1440 widths and light/dark. Synthetic transport labelled. Primary checked result JSON and representative narrow/wide screenshots.
- [x] Source ready for review; independent reviewer accepted the final message-scoped tool-cache correction and targeted regression.
- [ ] Exact branch commit/push and handoff gate (verified in private delivery receipt after execution); normal protected main/CI via existing publisher.
- [ ] New immutable desktop artifact, target installation and real dual-device acceptance; do not promote synthetic evidence to real acceptance.

## Completed

Current code changes stay in renderer remote-session module. Uses existing shareEqualJson and WeakMap presentation identity, common MessageList/scroll model/controller, original per-connection request queue. No provider/config/data migration or dependency change. Dependency lock (all non-root packages) equals the reused immutable local node_modules; Node24.20.0.

## Verification

41 tests in 7 files pass (transcriptPresentation/observation/polling/RemoteSession sync/errors/update/base). A running six-second no-change fixture issues 20 reads while retaining timeline identity and zero extra App observations; a changed response still paints, idle cadence returns. A 120-tool changed-text fixture preserves all 120 tool blocks and changes only a revised tool result. A raw tool record reused across messages keeps separate message-owned block IDs. These are controlled measurements, not physical-network or user-typing latency.

Independent browser evidence is in WPS work/REMOTE-UI-20261020/smooth-20261024/independent/findings.md and per-engine result.json/screenshots. Both engines pass 6 remote plus 6 ordinary cases. Chromium used cached Playwright 1243 (the default 1212 binary was absent); WebKit 2259. Only the known baseline Virtuoso key warning was observed. The finite cache-owner correction was subsequently source-reviewed and passed 9 targeted tests; it does not alter layout or interaction owners. Full TypeScript, scoped ESLint and classification (453 server tests) pass. No dependency was installed or modified.

## Coordination and dependencies

Repository https://github.com/heavenzhang/MoXBots.git; base fda7728fa11ee0b1138e9357b2b81e680f408043. Sole desktop macOS/updater CI/build/version/install/publish owner01a12bc2-907a-7702-b6dd-788225c5dfe4 / MoxBots桌面端统一打包负责人. User authorized main and release in original task; developer does not run shared CI or change frozen520. The separate original-target state projection fix0dbc is queued by its original author/publisher and is not duplicated here. Real Air Session04b28b24 remains no-replay; real GUI requires fresh owner/window handback. This source work does not touch installed App or business sessions.

## Execution

Primary implements and owns integration/acceptance. Bounded non-implementing UI quality reviewer /root/smooth_ui_review (requested gpt-6-luna/medium) owns isolated headless browser evidence, no product writes or production actions. No external model calls: existing native-only task workflow, deterministic source/UI checks. Primary model switching and exact token/cost not exposed; do not estimate savings.

## Next step

Commit/push this reviewed branch, verify remote identity with the handoff gate, then request existing publisher exact-head CI/main/next unfrozen release. Evidence outside Git: WPS work/REMOTE-UI-20261020/smooth-20261024/. Actual main inclusion, CI, immutable release, installation and real dual-device acceptance each require separate evidence; local checks do not close those gates.
