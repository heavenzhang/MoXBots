<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/browser-zoom-geometry-20261024 -->
<!-- git-project-sync-task:base=81ec17c013f2160646bcc6c9a5f9e74cbc9e4975 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-BROWSER-GEOMETRY-20261024

## Objective

Keep the embedded BrowserPanel aligned with its actual right-side container when
the main desktop UI is zoomed. Fix coordinate conversion only; preserve webpage
content, generation fencing, serialized resize, transition and overlay guards.
Development/UI quality owner: current chat `01a16dd4-692c-7e41-8d15-ff80619785b9`.

## Acceptance criteria

- [x] Reproduce create and resize failures against the old implementation.
- [x] Convert all four CSS bounds with the successfully applied main-WebView zoom.
- [x] Track live zoom/reset through the existing geometry reconciler.
- [x] Preserve 100%, CSS-development zoom and native DPI semantics.
- [x] Focused tests, TypeScript, scoped lint and production Web build.
- [x] Isolated actual WKWebView geometry validation at nine zoom levels/two sizes.
- [ ] Owner-coordinated shared CI and integration into real remote main.
- [ ] Owner-selected signed artifact, installation/release and real browser-panel acceptance.

## Completed

Existing appZoom controller exposes its successfully applied native scale;
BrowserPanel uses it for both create and resize through one measurement path.
No new owner/store, Rust protocol, dependencies, version change or migration.

## Verification

See `dev-docs/browser-geometry-20261024/acceptance.md` and measured
`evidence/native-webkit.json`. Primary self-review, no independent reviewer for
this isolated conversion fix; no subagents or external models were invoked.
57 focused tests and 8 build-time theme checks passed. TypeScript, scoped lint,
Web build and 18 real isolated WKWebView cases passed.

## Blockers and unknowns

Main/shared CI and desktop/macOS-arm64/updater publisher remain solely owned by
`01a12bc2-907a-7702-b6dd-788225c5dfe4`, per the existing shared plan. No shared CI,
PR, merge, formal build, signing, App installation/restart or stable-pointer write
was dispatched by this chat. The owner is currently using the daily App for QA;
only one read-only app-state observation was made. The current frozen 521.2
artifact is not changed or claimed to contain this fix. Real signed-client
visual/interaction acceptance remains open. Windows/Linux native execution is
not covered by the macOS probe. No cross-chat message was sent.

## Next step

The registered owner reviews this exact remote branch and local release-queue
entry `MOXBOTS-BROWSER-GEOMETRY-20261024.json`, then selects the next unfrozen
integration/CI/release batch. Preserve author history and verify current main
before integration. In the signed App, open local HTML at 100%/150%/200%/75%,
resize/move the split and sidebar, hide/show the panel and reset to 100%; verify
the native webpage stays below its own toolbar, inside the right pane and usable.
