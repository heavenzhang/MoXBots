<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-chat-layout-20261020 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-IPHONE-ACCEPTANCE-20261019 / mobile chat layout

- Repository: https://github.com/heavenzhang/MoXBots.git
- Canonical integration/release branch: main. Task branch: codex/mobile-chat-layout-20261020.
- Base: 18e13ce8dbad20e61af3f84173ad87d84bf090a6.
- Human scope: fix actual iPhone conversation rendering and other reproduced mobile bugs; retain current account/data and original101 identity/config. Daily Mac is excluded.
- Latest human decision: "由桌面统一打包负责人统筹". Sole project CI/release coordinator is 01a12bc2-907a-7702-b6dd-788225c5dfe4. This chat01a12b99-7b38-78b1-831f-9c60257d386a owns development and phone evidence, and does not independently start shared CI/build/install. Earlier phone handoff remains historical; the latest centralized direction controls further publication.
- Version: current internal0.1.0/build1 remains installed. The earlier build2 suggestion is withdrawn from source pending allocation by the unified owner. Freeze exact source SHA and new immutable build/archive identity before any future installation. Preserve original build1 archive.

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
- [ ] Continue real file/voice acceptance using controlled data; no model execution.

## Verification

Local npm typecheck/lint and67 policy tests pass. Four widths320/390/428/768 browser tests pass after final image-card repair. Root reviewed synthetic screenshots. Additional physical reproduction confirmed a prior Bot receipt error remained after switching to a different Bot. Explicit target selection now clears that old view notice; a two-Bot synthetic browser regression passes. The underlying receipt rejection remains separate. iOS Hermes export precheck passed before final image error-collapse/key change; final main package still required.

## Blockers and unknowns
Private evidence: project pointer output/mobile-chat-layout-20261020; build1 evidence output/iphone-acceptance-20261019. Do not commit business screenshots/session text or credentials.
An actual read-only history open also returned TARGET_RECEIPT_INVALID on one existing target. Source/target receipt diagnosis remains pending; renderer repair must not be represented as fixing that error. Do not weaken protocol validation or update/restart a daily Mac to make acceptance pass.
No production cloud, original101, desktop updater or public mobile store release is authorized by this record. Phone installation is the explicitly transferred internal test target. Keep source/main, browser fixture, signed device build, real user paths and voice recognition as separate results.


## Next step

Send exact remote task SHA, this record and local evidence to the human-designated unified CI/release owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Owner coordinates existing automatic runs, remaining CI/review/main integration, version/build freeze and internal phone publication. No independent CI rerun or artifact publication by the implementation chat. Continue read-only phone diagnosis without changing current human login or daily Mac.
