# Physical iPhone follow-up: conversation layout

Task: MOXBOTS-IPHONE-ACCEPTANCE-20261019. The human reported that the installed phone client works, then explicitly identified conversation text/Markdown/code/image layout as defective.

## Repair

Assistant messages previously rendered their entire Markdown source inside one native Text. Headings, emphasis, lists, fences and tables consequently appeared as punctuation. The transcript also called scrollToEnd on every content-size change, interrupting history reading when responses or images changed height.

The existing screen now uses a memoized native Markdown component backed by a pinned JS-only lexer. Headings, paragraphs, emphasis, inline code, nested/numbered/task lists, quotes and rules remain native selectable text. Code preserves indentation and tables retain cell alignment; both scroll horizontally inside the message, while the assistant answer uses the available phone width. User messages remain literal selectable text.

HTML stays inert text. No WebView or HTML execution is introduced. Web links require explicit taps and validated HTTP(S) URLs without embedded credentials/control characters. External Markdown images show their label and require an explicit load action; no background fetch occurs merely from reading model output. Local/Host-only image references direct the reader to the existing controlled artifact path. Changing an image URL creates a new unloaded card; a previous URL's load consent is not reused. Image failure collapses the image area and retains a readable error/open-link action. Formula typesetting and executable Mermaid/HTML are not implemented by this change.

The screen follows new content only while near the bottom. A reader above that area keeps their offset through normal polling and image layout, with an explicit return-to-latest control. Changing the original account/target/session view resets this presentation state; execution, persistence and approval owners are unchanged. A further physical reproduction showed a failed Bot notice leaked into another selected Bot. Explicit target changes now clear that prior view notice; new current-target failures still surface.

## Validation states

- Code/prechecks: typecheck and Expo lint pass; 67 policy tests pass, including mixed Chinese Markdown, nested/task lists, incomplete streaming fences, URL restrictions, entity decoding and reading-position boundaries.
- Browser integration: synthetic-only QA at widths320/390/428/768. No pageerror or document overflow; actual code/table horizontal scrolling, no automatic external image requests, failed-image handling, stable reading offset across image layout plus a snapshot poll, and explicit return-to-bottom pass. A fifth two-Bot case verifies that a first target receipt failure remains observable, then clears when explicitly selecting a healthy second target. Root visually reviewed narrow/wide screenshots. Repro: start `mobile/app` with `EXPO_PUBLIC_MOBILE_QA=1 npx expo start --web --localhost --port 8091`, then `node scripts/verify-mobile-message-layout.mjs`.
- iOS bundle precheck: production Hermes export succeeds with QA disabled. It is not signed/installed-device acceptance.
- Main delivery, frozen signed internal repair build and actual phone review remain pending until recorded by the sole owner. Build1 archive is preserved. Publish/install only from the verified main commit, never from this task branch.
- Physical baseline: signed build1/source18e13ce8 installed and launched; online Bots and an existing human account/session list were observed. The human asked to preserve that account. One actual history-read target returned TARGET_RECEIPT_INVALID; that separate receipt failure remains unclosed. Do not claim the renderer repair fixes it or weaken target validation to bypass it.
- File/voice physical acceptance remains tracked separately in the parent task; synthetic content, successful export and installed app are not speech recognition or Host upload evidence.

Private evidence is under the project pointer `output/mobile-chat-layout-20261020` and `output/iphone-acceptance-20261019`. Business screenshots, account material, device credentials and signing profiles are excluded from Git. Original101 witnesses remained Ready with unchanged identity/config/PIDs; no daily Mac runtime, cloud, original Host or public mobile store was changed.

## Release coordination

Integration/release branch: main. Latest human direction designates01a12bc2-907a-7702-b6dd-788225c5dfe4 as sole project CI/release coordinator; implementation/phone evidence remain with01a12b99-7b38-78b1-831f-9c60257d386a. Current internal app0.1.0/build1 is preserved; next build identity is allocated by the coordinator. Freeze the exact integrated SHA, coordinate relevant CI, record immutable tag/archive digest and install the same verified artifact. Existing desktop/cloud publication lanes retain their owners and versions.


## 2026-10-20 priority update

The human explicitly deferred unresolved speech so that it cannot block normal conversation delivery. The separate speech branch ba578a5ea stays out of this batch. Physical voice recognition remains failed/unaccepted; do not claim it is fixed. Proceed with independent review/current-main+layout CI, a newly frozen internal phone candidate and real session/history/layout/draft acceptance. No new recording or repeated dictation is needed now. Real file-to-Host acceptance remains its own gate, not implicitly passed. Original101/current login/daily Mac constraints remain. The CI/release owner was notified of this exact priority change.


## Core conversation repair checkpoint — 2026-10-21

Latest direct human scope: finish session open, history loading and chat layout; fully test, merge main and coordinate a new iPhone install/physical acceptance. Speech remains a later batch. Daily Mac must not be changed.

### Reproduced code defects and repair

- An existing-session get failure cleared the snapshot while retaining the intended session owner. Empty UI and send routing treated missing snapshot as a new chat. Existing-session send now requires a matching loaded agent/session; the event handler also rejects a stale target/render. Failure displays a read-only retry, and the existing scoped draft survives retry/reopen. An explicit synthetic send after successful retry continues the original session and does not create another one.
- No older-history UI consumed the existing get.before cursor, so only the latest30 messages were reachable. Explicit pagination now prepends older message-only pages, rejects foreign/duplicate/stale/non-progressing pages and keeps history across overlapping latest-window updates. Latest snapshot alone continues to own generation, approvals, receipts and sends; old pages cannot grant mutation authority. Disjoint history replacement resets the reading projection rather than silently joining a gap.
- A successful poll with the same revision left a stale read failure visible. Only snapshot-source notices now clear after a valid read; other account/receipt notices are retained. Explicit Bot switches also clear their prior view notice.
- Native tool summaries previously flooded the transcript. Display-only tool cards start collapsed, show actual status/name and reveal selectable output with local horizontal/vertical scrolling. Tapping a card never invokes tools, retry or approval. No heuristic decoding of already unwrapped JSON documents is introduced.

### Local acceptance

TypeScript, Expo lint and73 policy tests PASS. Isolated no-account browser tests PASS: failed-open/new-session fence, draft retention/reopen and explicit original-session send, three-page90-message histories at320/390/768 with injected read failure/retry, stable prepend anchor, latest polling retention/exhaustion/return-bottom, same-revision recovery. Markdown/HTML/link/image/code/table/Bot-isolation regression at320/390/428/768 PASS, including folded/read-only tool output. Root viewed retry/history screenshots. Private generated evidence is output/mobile-chat-layout-20261020/core-final and layout-final. This is synthetic browser acceptance, not actual Host or phone delivery.

Current-main integration base4206eb2ef8f8bf2f9dc211b4f13842441dead0de is merged locally; only shared-plan append conflict was reconciled by retaining both sides. The latest main's remote tool-output unwrapping is preserved. No shared CI rerun/formal build/install has been run by this implementation lane.

### Real-device limits and remaining gates

Installed phone is still18e/build1. Actual read-only phone view currently shows some business history plus TARGET_RECEIPT_INVALID. Source recovery/UX protection is implemented; the original target payload/root cause is not proved fixed by these changes. A bounded log-code scan supplied no diagnosis. Do not restart/update the excluded daily Mac or relax strict wire validation. New current-main CI and immutable phone candidate plus physical open/read/history/layout/draft verification remain required through the registered mobile batch coordinator01a12bc2.

The complete MOBILE-002 backlog is retained separately: login/consent/recovery, original Session approvals/replay rejection, actual attachment/Host bytes/results return, deferred dual-platform speech, real provider-backed background/cold-start notifications. Private handoff from the original source chat is acknowledged as evidence, not a new release owner or permission to override this chat's latest direct human speech deferral. Do not close the whole backlog with layout tests.

### Concurrent source work boundary

This task owns mobile/app/src/app/index.tsx, MessageContent.tsx, ToolResult.tsx, messagePresentation.ts, transcriptHistory.ts and its adjacent QA/tests until this checkpoint is delivered. Independent visual/prototype work can prepare isolated pure presentation components/themes without editing these files or current device/runtime; integration requires a reviewed exact SHA and behavioral regression. No new implementation, persistence or release owner is created.

### Current physical delivery state — 2026-10-21

Earlier build1/owner-waiting descriptions above are historical. The direct human mobile-unit transfer, signed in-place build2 and qualified real-device results are recorded in [iPhone core acceptance](iphone-core-acceptance-20261021.md). Root01a12b99 now owns this mobile CI/release unit. Original business-target recovery remains open; the daily Mac was not used as a workaround.
