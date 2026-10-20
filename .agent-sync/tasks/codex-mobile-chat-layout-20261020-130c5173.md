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

## Mobile unit intake and CI repair — 2026-10-21

Human transfer verified from actual reply, sole mobile owner now this chat01a12b99; shared plan/map and internal build2 record are updated. Root branch fast-forwarded accepted2b976 and records allocation0.1.0/build2. PR174 first exact head88cc9788 reached mobile policy PASS but shared JS root lint failed no-control-regex in messageLink. Equivalent ASCII character-code rejection plus full control/space/DEL/entity boundary regression retains safety and raises policy count78. Fresh exact-head CI is required; no failed/cancelled result counted as PASS. Current app signing/install/real core acceptance remain pending; old build1 rollback bytes independently re-read and retained. Private cache build from accepted source is preparation only, with final app built from verified integrated main.

Hosted runner recovery: exact abc822ce run39463701296 all executed jobs PASS, but Mac26/WindowsLatest never acquired hosted runners and were cancelled (no steps). Bounded targeted retry does not count as acceptance. Mobile owner is the sole executor for this PR's shared Test; desktop owner notified of a reversible compatible lifecycle pool adjustment, with all commands/check names/assertions retained and explicit ARM/Xcode26.3/SDK26.2/x64 verification. This changes validation OS coverage and is documented in internal-build2-20261021.md; full app job/local27.1 signing environment remain unchanged. Fresh exact-head CI and all main/artifact/phone gates remain mandatory.

Internal test scheduling: human-authorized development iPhone may receive exact reviewedabc822ce build2 solely for physical acceptance while shared hosted CI/main are pending. The previous serial order was this owner's execution choice, not a human ban on candidate tests. Keep all final gates open, retain exact source/native/JS/archive and data-preserving rollback; eventual main must contain the candidate and have identical build inputs to promote the same artifact, otherwise allocate a new build. CI compatibility pool change is separate and retains all original assertions/steps; no formal acceptance inferred from candidate install.

## Actual iPhone acceptance and remaining CI — 2026-10-21

- [x] Exactabc822ce QA-disabled signed internal build2 installed in-place; source/native/JS/archive/entitlements independently verified.
- [x] Actual original-account native login, controlled encrypted Host session/history (30+30+30), stable prepend anchors, rich text/code/table/real PNG and failure/tool display, scoped draft and foreground return; main receipt `dev-docs/mobile-002/iphone-core-acceptance-20261021.md`.
- [x] Controlled mount disabled/left, controller+Host sessions revoked, two temporary units stopped; original101 twelve identity/key/config witnesses and PIDs unchanged, phone session retained, DeviceHub restored, daily Mac untouched.
- [ ] Exact-head CI and actual remote-main integration. ARM hosted attempts had no runner/zero steps; evaluate the explicit Intel15 Mac-only supplement with all lifecycle commands and iOS native checks retained. Default PR/push full ARM path remains unchanged. Intel is not ARM desktop artifact acceptance.
- [ ] Original unavailable business target TARGET_RECEIPT_INVALID; controlled synthetic success is not business recovery. Full002 send/approval/files/voice/push retain separate gates; voice deferred.

Only workflow/environment and these acceptance records change after07f; mobile/native artifact inputs remainabc-equivalent and must be checked against final main before promotion/tag.


## Concurrent main integration — 2026-10-21

While the original exact dac82661 ARM run39478430991 completed all nine required jobs successfully, desktop PR173 advanced main to a487b5d353780fef4b624b42dd01d7d0ad4958d3. Integrate that main normally and retain both task histories. The shared workflow keeps main's arm64/Xcode26 verification (ARM-only for the explicit Intel supplement), the full ordinary ARM gate and all lifecycle command bodies. Old run results are historical; the new combined head requires its own ordinary full CI. The extra Intel run for dac remains separately attributed, not a result for the new SHA.

Artifact sourceabc822ce mobile, native Rust closure, Cargo manifests/locks, vendor input, toolchain and root dependency inputs are byte-identical to the combined candidate; desktop renderer/server source and desktop version changed outside the iPhone build. The signed installed build2 remains an internal candidate pending current-head CI/main/input proof; never re-stamp or rebuild different bytes under build2. No new device, original101 or daily-Mac operation. Full002 original business/attachment/approval/speech/push gates remain open.
