# MOBILE-BOT-IMPLEMENT-20261101

Goal: implement the approved Bot + continuous-conversation mobile experience in the existing Expo app, then deliver source through the existing shared CI/main owner and mobile release owner. Canonical repository heavenzhang/MoXBots; isolated branch codex/mobile-bot-experience-20261101; base 3b62a664ff1d33282592dddf6da2a38045264787. Existing worktrees preserved.

Design: WPS MoxBot/output/mobile-grok-concept/v8 plus the 2026-11-01 holistic review. Recent work first, stable Bot attribution, continuous instruction through original send path, action-specific approvals, persistent multiple deliverables/history. No fake model, new execution system, hardcoded production bots or client-side approval success.

- [x] Locate current source, main, active release owners and SDK 58 instructions.
- [ ] Implement representative recent-work page and inspect actual rendering before extending patterns.
- [ ] Bind Bot grouping/profile and recent work to real authorized target/session data, preserving exact owner and drafts.
- [ ] Preserve outcomes across new messages; expose multiple deliverables and genuine immutable versions without fabricating server history.
- [ ] Keep approval submission, execution and delivered output distinct; continuous messages use original receipt and runtime.
- [ ] Focused regression, full mobile policy tests, typecheck and lint.
- [ ] Primary and independent rendered UI review at 390x844 and 320x740; list/Bot/chat/approval/artifact/return/error paths.
- [ ] Commit scoped source, push branch, hand exact SHA to shared CI/main owner; verify actual remote-main containment after merge.
- [ ] Hand fixed source and evidence to existing mobile owner for next unfrozen candidate; verify release/installation separately, no replacement of current frozen candidate.

Acceptance: existing login/connection/receipt/draft/attachment/notification fences unchanged; no local inference of execution completion; same Bot/session identity on every route; old files don't disappear on a new turn; no fabricated versions; errors retain context and usable next action.

Owners: primary current agent implementation/integration. One bounded independent reviewer to follow. Artifact implementation may be delegated after interface inspection. Native-only ai-yaoren-local; model/usage metadata recorded when exposed. No external models this run.

Deployment: shared CI/main owner 01a12bc2-907a-7702-b6dd-788225c5dfe4; mobile iOS/Android build/sign/install owner 01a12b99-7b38-78b1-831f-9c60257d386a. Both are active on earlier mobile batch. This task does not run their shared CI, issue a release number, replace frozen artifacts or write production. User authorized implementation/push; owner handoff follows user AGENTS workflow.

Status layers: source in progress; tests pending; local fixture UI pending; live Host/native integration pending; remote main pending; release/physical phone acceptance pending. Fixtures prove UX behavior only.
