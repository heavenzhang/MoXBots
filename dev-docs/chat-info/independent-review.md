# Independent review — MOXBOTS-CHAT-INFO-20261020-01

Reviewer: independent `ui_review` worker; implementation and final acceptance remain with primary.
Environment: isolated worktree `codex/chat-info-20261020`, base `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`; integrated uncommitted renderer changes, `http://127.0.0.1:8918/chat-info-qa`. Actual production MessageList/Message/BlockGroup/TurnFileEditSummary/FileActionProvider components with synthetic transcript events and controlled native file transport. No native app, authenticated user, provider/model or production acceptance is implied.

## Current result

Independent local interaction/responsive pass: seventeen executed groups, no uncaught browser errors after completing the native event transport mock. Screenshots actually inspected: 1440/768/390 light and dark/English, narrow file preview, expanded process keyboard focus and narrow long status. Product-source SHA256 fingerprints and accepted final fingerprints are saved in the independent JSON evidence. One Virtuoso missing-key console warning of undetermined origin remains recorded, without NaN indices or failed interaction.

Final required local UI gate passed after the narrow full-list label repair. Its affected 390/768px layouts, English/dark rendering, third-file full-list access and draft retention were reverified with zero uncaught errors; final screenshots were inspected. Wider rows expose two direct files; narrow rows expose one readable direct file and retain all files through the existing full-list control. No new permanent panel or action row.

## Executed checks and evidence

Reproducible independent script: `independent-check.mjs`; isolated headless Chromium context, no user browser. Evidence: `independent-evidence/report.json`, final affected-layout `independent-evidence/responsive-refresh.json` and adjacent PNGs. Reproduce final affected checks with `independent-responsive-refresh.mjs`. Script requires real scroller height above 300px before testing to avoid the initial zero-height false positive.

- Ten current/wait status transitions: read, described shell command, explicit task wait, model wait, permission, question, plan, compaction, recovery, stopping. Each has exactly one 30px footer; interaction waits have no spinner. Current action uses CurrentCheck.ts, not historical SessionRecovery.ts/PermissionGuard.ts. Runtime recovery preserves attempt 2/countdown wording.
- Done removes the footer. Input draft survives all tested transitions.
- 1440×900, 768×1024, 390×844: actual scroller heights 793, 917, 711.61px respectively; document width equals viewport width, without horizontal page overflow.
- Process group keyboard Enter/Space expands/collapses while original public commentary stays in chronological order. Summaries retain concrete filenames/check output, with original detail controls reachable.
- Keyboard Enter on the first inline file opens the original FilePreviewModal and actual preview content. Invocation order proves revalidation/routing: `cmd_workspace_check_paths` for `reports/01-验收报告-会话恢复与权限隔离.md`, then `cmd_workspace_read_preview` for the same workspace/path. Close button returns to chat; full list exposes `第三份结果.md`; Escape closes that full-list popover.
- Dark English at all three viewports also preserves page width; visible orange keyboard focus outlines the expanded process header. Direct narrow filename button width exceeds 64px.
- Dark English rendering shows `Reading CurrentCheck.ts`; long command descriptions are available through existing status title while the row remains 30px.

## Repairs and code review

- QA-01 closed: fixture flex parent fixed. Initial screenshots were blank despite populated DOM; all listed evidence is from the usable-height fixture.
- QA-02 closed: explicit pagination index removes NaN indices. Missing-key console warning is retained as a separate undetermined-origin boundary, not silently discarded.
- QA-03 closed: actual file sort and Write result semantics drive selectors (`01-` report; 已编辑). No fabricated creation claim.
- CODE-01 reviewed: row render values now flow through Virtuoso context rather than render-phase ref assignments. Event-only latest refs synchronize in layout effects. The component-local committed snapshot publisher advances only after a visible committed layout effect; hidden renders read the same frozen snapshot. This preserves the original committed-only cache semantics, without new persistence authority. `useSyncExternalStore` can cause an extra active render after publish; stable memoized context prevents a publish/render loop. Parent owns final lint/freeze/timer/scroll regression execution and integration.
- COMPAT-01 closed in source: string-content messages now honor `streamingTextActive`.
- UI-01 substantially repaired: original narrow direct-file buttons were ~26px wide and visually icon-only. Current row provides one readable filename at 390px, with second filename responsive-hidden and all files in full list. Final shortened list label is readable as `3 个文件` at 390px (control width 103.5px) and `3 files` in English; 768px retains `本轮编辑 3 个文件` (292.5px). The direct filename remains readable and full list remains keyboard reachable. UI-01 closed.

## Explicit boundaries

The original FilePreviewModal uses the centralized Cmd+W close layer; its only direct Escape handler is for renaming. OverlayBackdrop has no Escape handler, and the fixture does not mount App global keyboard dispatch. Preview closing was therefore tested through its actual close button; a full-app Escape regression claim is not made. The existing full-list popover Escape path was exercised.

Initial native preview teardown errors (`unregisterListener`) were caused by incomplete fixture transport: installed `@tauri-apps/api/event.js` requires `window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener`. Adding a no-op to the controlled test transport yields zero uncaught errors. No product code was changed for this mock issue.

No product-source edits, shared CI, commits, pushes, releases, production writes or external messages were performed by reviewer. Usage/cost unavailable. Primary remains responsible for final regression evidence, source delivery, publication handoff and real native acceptance.
