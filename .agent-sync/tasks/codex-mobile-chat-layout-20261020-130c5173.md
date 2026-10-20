<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-chat-layout-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-IPHONE-ACCEPTANCE-20261019 / mobile chat layout

- Repository: https://github.com/heavenzhang/MoXBots.git
- Canonical integration/release branch: main. Task branch: codex/mobile-chat-layout-20261020.
- Base: 18e13ce8dbad20e61af3f84173ad87d84bf090a6.
- Human scope: fix actual iPhone conversation rendering and other reproduced mobile bugs; retain current account/data and original101 identity/config. Daily Mac is excluded.
- Latest human decision (2026-10-21, verified original reply in chat01a1488b): “是，手机端交给 Bots手机端开发2”. This chat01a12b99-7b38-78b1-831f-9c60257d386a is now sole mobile CI/build/version/sign/install/acceptance owner; desktop stays01a12bc2. Shared plan records explicit transfer and activity audit; this supersedes the earlier centralized assignment for mobile only.
- Version: current internal0.1.0/build1 remains installed. Receiving owner allocates0.1.0/build2 for this core batch, with immutable tag/artifact and final integrated-main SHA required before installation. Preserve signed build1 archive and current account/data; no uninstall or identity reset.

## Objective

Repair readable mobile conversation layout while retaining account/session/Host identity and execution authority.

## Acceptance criteria

Native structured text, local wide-content scrolling, stable history reading, safe explicit resource loading; relevant local tests, central CI/main delivery and physical phone review recorded separately.

## Completed

Implementation and local verification are complete; central CI/main/release and physical repair acceptance are not.

## Completion checklist
- [x] Live installed build1/source18e13ce8 verified; existing human account retained; online Bots/session list observed.
- [x] Reproduced source defects: raw Markdown in one Text; unconditional scroll-to-end on all content changes.
- [x] Implement native structured Markdown, bounded horizontal code/table layouts, inert HTML, explicit image loading and safe links.
- [x] Add opt-in synthetic rich-text QA scenario and bottom-follow behavior.
- [x] Type/lint, 67 behavior tests, four browser widths320/390/428/768, no pageerror/global overflow, local code/table scroll, image no-prefetch and stable reading offset; screenshots reviewed by root. iOS production Hermes export passes.
- [ ] Review source diff and exact-current-main integration; normal protected main delivery/remote containment.
- [ ] Freeze integrated main, signed internal build2, same artifact install and actual iPhone review.
- [ ] Continue core conversation/history/layout acceptance and controlled file paths; no model execution. Speech is explicitly deferred by the human and is not a gate for this batch.

## Verification

Local npm typecheck/lint and67 policy tests pass. Four widths320/390/428/768 browser tests pass after final image-card repair. Root reviewed synthetic screenshots. Additional physical reproduction confirmed a prior Bot receipt error remained after switching to a different Bot. Explicit target selection now clears that old view notice; a two-Bot synthetic browser regression passes. The underlying receipt rejection remains separate. iOS Hermes export precheck passed before final image error-collapse/key change; final main package still required.

## Blockers and unknowns
Private evidence: project pointer output/mobile-chat-layout-20261020; build1 evidence output/iphone-acceptance-20261019. Do not commit business screenshots/session text or credentials.
An actual read-only history open also returned TARGET_RECEIPT_INVALID on one existing target. Source/target receipt diagnosis remains pending; renderer repair must not be represented as fixing that error. Do not weaken protocol validation or update/restart a daily Mac to make acceptance pass.
No production cloud, original101, desktop updater or public mobile store release is authorized by this record. Phone installation is the explicitly transferred internal test target. Keep source/main, browser fixture, signed device build, real user paths and voice recognition as separate results.


## Next step

Send exact remote task SHA, this record and local evidence to the human-designated unified CI/release owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Owner coordinates existing automatic runs, remaining CI/review/main integration, version/build freeze and internal phone publication. No independent CI rerun or artifact publication by the implementation chat. Continue read-only phone diagnosis without changing current human login or daily Mac.

## Human priority change — 2026-10-20

Exact human direction: “如果语音功能现在修不好，先做别的，别影响整体会话功能的实现。然后这个问题回头再修”. Defer speech repair ba578a5ea37cc6c0e685ab4f7617de22e2686264 to a later mobile batch; do not wait for speech accuracy or combine its native changes into the current conversation candidate. Preserve both failed physical readings and pending task MOXBOTS-IOS-SPEECH-FAILURE-20261020. Current priorities: session open/history loading, readable Markdown/code/table/images, stable history reading, target isolation, retained drafts and existing send/receipt authority. Speech remains unaccepted; no repeated dictation or recording now.

CI/version/build/install coordination remains with human-selected01a12bc2. Latest per-deployment-unit policy permits independent units and does not reassign their owners; earlier “project-wide” wording above describes the earlier decision, not authority over unrelated units. This chat continues source/read-only phone evidence without shared CI or installation.

## 2026-10-21 core conversation continuation

- [x] Merge actual latest main4206eb2ef locally, preserving both plan appends and concurrent remote tool rendering fix.
- [x] Prevent failed/pending existing-session reads from falling through to a new session; read-only retry and draft retention.
- [x] Paginate older messages via existing cursor while keeping live snapshot as sole mutation/approval authority; foreign/duplicate/non-progressing pages rejected.
- [x] Clear only recovered snapshot-read notices, including unchanged revision; isolate target changes.
- [x] Read-only folded tool results with bounded two-axis output display.
- [x] Type/lint/73 policy plus core and rich-text responsive browser regressions PASS; see acceptance doc for exact scope.
- [ ] Independent owner review, coordinated CI and protected remote-main merge.
- [ ] Freeze new immutable internal build and install/retest actual phone open/history/layout/drafts.

No claim that source repairs prove the physical target's TARGET_RECEIPT_INVALID root cause is closed. Speech stays deferred under the latest direct human instruction. Complete MOBILE-002 five-path backlog remains open; private original-chat handoff read/retained outside Git. No daily Mac/original101/cloud operation. Current writer bounds and coordinator dependency: dev-docs/mobile-002/chat-layout-20261020.md.
