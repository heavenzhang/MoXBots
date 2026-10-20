# MOXBOTS-MOBILE-PARITY-20261020

## Scope and reference

Latest human direction is to use Codex mobile as the conversation presentation baseline, retaining the approved V6 prototype as the functional reference. This batch changes the real React Native client, not the prototype or the native transport.

Official sources read: [Codex mobile](https://learn.chatgpt.com/docs/mobile) and [remote engineering workflow](https://developers.openai.com/blog/mastering-codex-remote-for-engineering). The mobile documentation includes an illustrative phone UI with a compact toolbar, search entry, scope chips and dated session groups. It is an official website illustration, not an authenticated Codex app capture or a pixel-accurate specification. `reference-home.png` and `reference-chat.png` in private evidence are captures of our V6 prototype, not Codex. Existing protocol limitations remain explicit.

## Result

- Compact session header with account, search and new conversation. Real Bot chips retain online/offline state. Search filters the selected Bot's native rows without changing session identity/order. Calendar groups and relative timestamps use real metadata.
- Conversation information identifies the original Bot/device/session; continuation requires the full target/identity/agent scope. No synthetic pin/archive/rename success is introduced.
- One 52px chat toolbar, direct results entry, subdued user bubble and plain assistant reading surface. Resting composer is one compact row with a microphone icon. Optional file/image/model/voice/suggestions controls use a popover instead of permanent stacked rows.
- The popover does not resize the transcript. Focus enters its close control, Tab remains inside, Escape/outside touch closes and focus returns to the trigger. Background input/send is covered and cannot edit or submit while open.
- “Back to latest” floats above the composer rather than taking another row. Markdown, code, tables, explicit media and folded tool output reuse the reviewed renderer; only their colors are unified with the neutral theme. Code/table horizontal scroll and tool two-axis scroll remain independent.
- Account, notification and artifact routes share presentation colors. Their actual account/permission/upload/download behavior is preserved; unsupported changes stay unavailable.

## Combination and preserved behavior

Base main: `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`. UI stage: `b8b9a2eb27a5aebdebabddfe34d2d31939c110c4`. Combined by normal merge with authorized conversation source `8128596dbdebb031dd4a6c057107ff2b6ee80d9b`. Speech source ba578 is excluded from this batch per existing coordination.

Three resolved files: `native.ts` retains both QA scenario sets; `qa/fixture.ts` retains history/read-failure resets alongside the directory fixture; `src/app/index.tsx` combines compact presentation with original guarded reading/history logic. `setNotice(null)` on Bot switch remains. These are real source combinations, not replacements with prototype handlers.

Preserved: `sessionSnapshotReady`, requested-session and snapshot refs, read-only `retrySnapshot`, original draft ownership, separate history reading projection/cursors/overlap/nonprogress rejection, prepend anchoring, latest snapshot as sole generation/approval/send authority, scoped read-failure recovery, receipt/foreground/route guards, safe links/inert HTML/explicit media, read-only collapsed tool output. Results entry additionally rejects an awaiting or mismatched snapshot.

## Acceptance matrix

All browser checks use the actual app with the existing explicitly synthetic web-only native fixture gate (`__DEV__`, web and `EXPO_PUBLIC_MOBILE_QA=1`). They never call a real account, Host, model or external image until an explicit image tap; the controlled external image then fails locally as expected. Isolated Playwright Chromium is used, not the user's Chrome.

| Journey | Starting state and result | Evidence |
| --- | --- | --- |
| Session list / search / continue | Six local rows, calendar headings, empty search, title match; info continues original scope; search survives chat return | `verify-mobile-session-navigation.mjs` |
| Composer / results / account | Draft persists; popover preserves message viewport and keyboard focus; results return without sending; profile/notification/back; explicit first send creates exactly one synthetic session | same navigation script |
| Read failure / history | Existing-session read failure cannot create a new session or send; read retry preserves draft; three pages / 90 messages; history/polling preserves anchor; return latest | `verify-mobile-session-history.mjs` |
| Long content | Heading/list/inline/code/table, no document overflow, local horizontal scrolling; image failure preserves reading position; tool output folded and independently scrollable; Bot-error isolation | `verify-mobile-message-layout.mjs` |

Navigation target widths/heights: 320x844, 390x844, 393x852, 427x952, 428x844, 768x844. Rich-message target widths: 320/390/428/768. History: 320/390/768. Typecheck, lint and 77 policy tests pass. Browser result JSON and representative rendered screenshots are kept outside Git under `MoxBot/output/mobile-parity-20261020/`.

Independent reviewer: `/root/mobile_parity_review` (read-only, non-implementer). Initial required findings repaired: honest status, info icon semantics, full identity scope, focus containment. Final review found background composer touch exposure while its popover was open; an explicit covering dismiss surface and pointer guard now prevent edit/send. Final review and primary recheck are recorded in the task file.

### History assertion correction

The original test required the first retained message to be less than 150px from the transcript top. On the new layout, at 320px the failed-read notice plus spacing put that message at Y251, transcript top Y79, both before and after prepend. Offset changed from 0 to 3977 as content height changed from 4213 to 8190; the visible message did not move. This is a correction of acceptance measurement, not a claim to fix an unobserved scrolling bug. The test now compares the same anchor before/after (<5px), records metrics/screenshots, and verifies polling also preserves it. Existing retry/90-message/no-auto-send/return-bottom assertions remain. The original debug observation is retained privately.

## Delivery boundaries

Source branch: `codex/mobile-prototype-parity-20261020`. No version increment, shared CI dispatch/re-run, PR, formal native build or phone installation is performed by this chat. The registered mobile coordinator `01a12bc2-907a-7702-b6dd-788225c5dfe4` owns the mobile CI/build/version/install batch; repair/physical evidence owner `01a12b99-7b38-78b1-831f-9c60257d386a` receives the exact combined SHA for independent review and coordinated intake. Main delivery and real phone acceptance remain open until those owners complete them.

This browser/layout acceptance does not close MOBILE-002 login/consent, original real Session approvals, system picker/Host bytes, real Chinese ASR, APNs/FCM background/cold-start delivery. It does not replace the installed iPhone package. No schema, native protocol, cloud provider or production target changes are part of this presentation batch.
