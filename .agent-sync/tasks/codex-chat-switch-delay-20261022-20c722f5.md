<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-switch-delay-20261022 -->
<!-- git-project-sync-task:base=c83b4c5b41a6a72f273c90aa7f1f768d916651ab -->
<!-- git-project-sync-task:status=in-progress -->


# Task: Keep long-chat navigation responsive during process updates

## Objective

MOXBOTS-BLANK-20261022 follow-up: diagnose and repair delayed navigation around the original long conversation. Preserve transcript, draft, tool authority, hidden-list snapshots, timing and disclosure behavior. Desktop CI/build/version/release/install/rollback stay with sole publisher thread 01a12bc2-907a-7702-b6dd-788225c5dfe4; later batch only, no frozen artifact changes.

## Acceptance criteria

- [x] Reproducible render invalidation cause and before/after real-component evidence; historical full native delay attribution remains limited.
- [x] 119 focused DOM tests, TypeScript and scoped lint; independent source/DOM/WebKit review. Full native acceptance remains separate.
- [ ] Commit/push and sole-owner integrated CI/main verification.
- [ ] New immutable desktop release and original-session native switch/blank/scroll acceptance.

## Completed

- Verified isolated current-main base and clean source before task init.
- Baseline WebKit real MessageList/Virtuoso + 372 synthetic process blocks: each append redoes 1119 locale calls, updates106–219ms, flood navigation1121ms. This demonstrates a blocking path, not attribution of the entire historical native delay.

## Verification

- `node scripts/verify-chat-switch-delay.mjs webkit --baseline`: immutable pre-fix1119 locale calls/append,113–153ms, synthetic flood click1028ms. Default fixed probe3–6 calls/17–33ms/click139ms; both retain restored list geometry and0browser errors.
- WebKit blank recovery5cycles/zero missing announcements and complete scroll script passed. Chromium independent rendered-page/locale zh-CN→en-US→zh-CN/hidden return passed with0 errors; reviewer inspected3 screenshots.
- Focused Process/BlockGroup/Timing34 + scroll/freeze/footer85 DOM tests passed; TypeScript/scoped lint passed. Independent reviewer found no blocker; bounded browser locale/visual checks tracked in private review receipt.
- Local private evidence: WPS MoxBot/work/chat-switch-delay-20261022. No business transcript or private raw UI content is committed.

## Blockers and unknowns

- Full scroll probe initially measured stale gap0 range before tall-row admission; added actual250paragraph/row>4000/stream-anchor readiness wait, unchanged shrink/blank-tail thresholds. Independent review and full WebKit rerun passed. Prior failures retained in private evidence.
- Native UI not acquired; publisher has other in-flight batches. Historical WebContent PID association and end-to-end navigation latency remain unproven. Do not infer them from the synthetic probe.

## Next step

- Commit/push this isolated task and hand exact SHA to sole desktop publisher for one integrated CI/main delivery and next unfrozen immutable release; then native original-session reacceptance. No developer PR/shared CI/build/install.
