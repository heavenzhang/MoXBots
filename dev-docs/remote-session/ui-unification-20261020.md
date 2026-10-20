# REMOTE-UI-20261020 — common conversation architecture

User required the remote page to share ordinary conversation technical architecture and presentation. Git destination explicitly confirmed: https://github.com/heavenzhang/MoXBots.git. Actual worktree `/Users/zhangshaohua/Documents/Codex/2026-10-20/moxbots-remote-ui`, branch `codex/remote-ui-20261020`; follow-up baseline `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`. Earlier remote text projection78351b8 is already in that main; this is a new unfrozen source batch.

## Delivered architecture

- Remote transcript → safe canonical Message adapter → common MessageList/Message/BlockGroup/ProcessRow/ToolUse. No independent remote article/tool renderer remains. Shared virtualization, row model, theme, spacing, disclosure, status and scrolling.
- Normal SimpleChatInput and remote TextChatComposer render shared ComposerSurface/Textarea/Toolbar/SendButton and autosize hook; same send shortcut config and IME logic. Remote stays text-only; draft clears after accepted remote receipt.
- Remote content context prevents nested Markdown/tool rendering from opening local files, decoding canonical JSON output again, mounting active widgets/media, local file summaries or local runtime action cards. No local Provider/runtime/workspace owner is created. Real remote interactions retain existing generation/turn/request/operation receipt fences.
- Parsed polling snapshots reuse unchanged message identities. Actual remote session/generation scopes geometry; absent timestamps stay unknown. Pagination deduplicates snapshot/older/page IDs and only registers an anchor for fresh rows.
- Shared scroll controller maintains history reading anchor through subsequent virtual row measurements, until newer user input/navigation/disclosure or lifecycle invalidation. Both ordinary Chat and remote use the same command. Flow composer is outside a properly bounded flex timeline; no overlap with timeline viewport.

## Local verification

339 distinct tests in26 files: prior24-file299-test renderer/unit regression plus36 controller and4 model tests;19 remote tests rerun after fresh-page changes. Final tests include delayed measurement/cancel/disclosure/session/delete/evicted-row behavior; duplicate and overlapping remote pages. Full tsc and changed-file ESLint are delivery gates. Evidence logs are retained outside Git under the WPS project pointer `work/REMOTE-UI-20261020/unification/`.

Actual product components/CSS with a synthetic account registry and transport: Chromium1208 and WebKit2259; each6 remote +6 ordinary cases at1440×900,800×700,390×844, light/dark (24 total). Checks cover disclosure keyboard action, long/unbroken input, newline, draft/disclosure preservation through freshly parsed polling JSON, single send, common composer styles and absence of page/input horizontal overflow. Remote timeline is also asserted to end before flow composer and keep a measurable viewport. Both consumers exercise25-row prepend, settled geometry, subsequent tail append; remote latest output remains reachable.

No actual account, remote execution, private business data, external network or user Chrome is used. Browser page errors/test errors must be empty. The existing patched Virtuoso scroll-extent element emits the same repeated React missing-key warning in ordinary and remote; the harness records that exact known warning and rejects every other console error. Dependencies were not changed to silence it.

## Failure and repair evidence

The stricter WebKit reading test exposed a real integration failure: estimated prepend heights changed again after one-shot restoration, pulling the reader despite follow=false. Native-firstItemIndex alone and shared row model + one-shot restoration also failed. Preserved logs distinguish those failed experiments from final passing evidence. The repair retains the exact anchor in the existing shared controller, driven by actual itemsRendered; cancellation tests verify it cannot override later user intent. Also corrected the remote timeline flex containment so tall drafts do not leave list paint beneath its flow composer; the acceptance now asserts the timeline/composer boundary.

## Independent review and execution record

Primary implements/integrates and runs local unit/browser checks. Bounded read-only `remote_chat_review` independently reviewed source, cancellation lifecycles, actual mobile/desktop ordinary/remote screenshots and result files. Requested worker model gpt-6-luna/medium via ai-yaoren-local; runtime identity, token usage and cost are not separately exposed. One worker chosen for independent acceptance of the shared renderer boundary; no external model channel or additional implementation worker was needed because the shared files are tightly coupled. No escalation/fallback. It did not execute the browser itself. Screenshots intentionally include a very long draft; native normal usage remains a separate gate. Retrospective: sharing primitives removed divergent render paths; future pagination checks must wait for measured geometry and append a later output, not stop at the first matching frame.

## Source, CI and release gates

Source commit/push and exact remote-head proof are recorded in the task and release intake. This chat does not run shared CI, official/native builds, version allocation, installer replacement or deployment. Desktop renderer/Sidecar macOSarm64/updater unit owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4` (MoxBots桌面端统一打包负责人). Owner coordinates PR/review/exact-head CI/latest-main integration and allocates the next unfrozen semantic version. Frozen015 source/artifacts are not relabelled; no Host/cloud/mobile/Windows rollout is inferred. Existing immutable rollback and signed-artifact promotion rules apply.

Not yet accepted: remote main integration for this follow-up, shared CI on final merged head, signed/native installation and authenticated controller/target real-user path. Browser fixtures do not prove encrypted channel behavior, Provider execution or daily installed client behavior. Earlier target-side projection still requires an updated target; this controller unification does not expand protocol/runtime/approval authority or fix the screenshot's unrelated execution failure.

## Final browser evidence

Durable evidence root: `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/work/REMOTE-UI-20261020/unification/final/`; `chromium/result.json`, `webkit/result.json`,12 screenshots per engine and `sha256.json`. Original temporary executions: Chromium `remote-session-ui-VWuUgt`, WebKit `remote-session-ui-qG44eB` under the macOS temporary directory. Six flow viewport assertions per engine pass; timeline ends8px before composer at all three sizes. Settled remote anchor130.390625→130.15625 (Chromium),130.390625→131.15625 (WebKit), unchanged after subsequent output. Ordinary counterparts51→50.765625 and0→0.765625. All absolute drift below1px. Primary and independent reviewer both inspected the final mobile evidence; independent reviewer also inspected desktop comparisons in the earlier equivalent common-renderer batch and revisited final containment. Earlier masked-content screenshot judgment was explicitly corrected after the parent flex repair.

Logs: `remote-unified-regression2.log` (299/24), `remote-unified-scroll-regression.log` (59/4;40 additional distinct checks), `remote-unified-scroll-regression2.log` (51/2 final fresh-page/controller checks); `remote-unified-typecheck-delivery.log` (exit0), `remote-unified-lint-final2.log` (exit0); final Chromium/WebKit logs each12 cases. All evidence is synthetic/private-local and is not a production artifact or release receipt.
