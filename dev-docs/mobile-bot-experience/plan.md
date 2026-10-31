# MOBILE-BOT-IMPLEMENT-20261101

Goal: implement the approved Bot + continuous-conversation mobile experience in the existing Expo app, then deliver source through the existing shared CI/main owner and mobile release owner. Canonical repository heavenzhang/MoXBots; isolated branch codex/mobile-bot-experience-20261101; base 3b62a664ff1d33282592dddf6da2a38045264787. Existing worktrees preserved.

Design: WPS MoxBot/output/mobile-grok-concept/v8 plus the 2026-11-01 holistic review. Recent work first, stable Bot attribution, continuous instruction through original send path, action-specific approvals, persistent multiple deliverables/history. No fake model, new execution system, hardcoded production bots or client-side approval success.

- [x] Locate current source, main, active release owners and SDK 58 instructions.
- [x] Implement representative recent-work page and inspect actual rendering before extending patterns.
- [x] Bind Bot grouping/profile and recent work to real authorized target/session data, preserving exact owner and drafts.
- [x] Preserve outcomes across new messages; expose multiple deliverables and genuine immutable versions without fabricating server history.
- [x] Keep approval submission, execution and delivered output distinct; continuous messages use original receipt and runtime.
- [x] Focused regression, full mobile policy tests, typecheck and lint.
- [x] Primary and independent rendered UI review at 390x844 and 320x740; list/Bot/chat/approval/artifact/return/error paths.
- [x] Initial source eed04a7b committed, pushed and received by both owners.
- [ ] Correct owner-reproduced durable draft transfer defect, independent review and corrective push.
- [ ] Resume existing shared CI/main intake and verify actual remote-main containment after merge.
- [ ] Hand fixed source and evidence to existing mobile owner for next unfrozen candidate; verify release/installation separately, no replacement of current frozen candidate.

Acceptance: existing login/connection/receipt/draft/attachment/notification fences unchanged; no local inference of execution completion; same Bot/session identity on every route; old files don't disappear on a new turn; no fabricated versions; errors retain context and usable next action.

Owners: primary current agent implementation/integration. Two bounded workers completed artifact implementation and independent UI review; primary integrated and inspected final rendered pages. Native-only ai-yaoren-local; model/usage metadata recorded when exposed. No external models this run.

Deployment: shared CI/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4; mobile iOS/Android build/sign/install owner 01a12b99-7b38-78b1-831f-9c60257d386a. Both are active on earlier mobile batch. This task does not run their shared CI, issue a release number, replace frozen artifacts or write production. User authorized implementation/push; owner handoff follows user AGENTS workflow.

Status layers: source implemented; local tests passed; local fixture UI passed; live Host/native integration pending; remote main pending; release/physical phone acceptance pending. Fixtures prove UX behavior only.

Earlier integration checkpoint: main updated concurrently: merged PR218 b55634eb through 7bf8f0aca. Retained exact upstream DraftPersistence token/journal and original readRecentSessions polling/cache. This task only projects real snapshot status; no parallel session-list authority. Mobile107/107, tsc/ESLint0warnings, root tsc/classification, source13/13 and store14/14 independently re-run after merge. Desktop cargo check running; final UI independent review running. Native build/version and installed app unchanged.

Initial local acceptance before owner review: 109 mobile tests, type/lint, root type/classification, source13/store14/Host check PASS; primary390/320 + independent complete fixture journeys PASS after rejection restoration repair. Desktop full local check stops at mandatory missing signed CLIProxy bundle, handed to original shared CI owner with normal resource staging. Initial source subsequently pushed as eed04a7b. Owner review reproduced draft deletion before destination persistence and held main intake. Current correction persists the destination before clearing its original ticket in both call sites; 7 disk-backed regressions added, all 116 mobile policies plus typecheck/lint pass. Independent corrective source review passed; child-process exit3/3 and primary rejection/processing UI follow-up passed. Independent follow-up UI lacked IAB; no native crash acceptance is claimed. Release and real-device acceptance remain separate. See validation.md.
