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
