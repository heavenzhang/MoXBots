# MOXBOTS-BLANK-20261022

## Goal and scope
Fix blank chat content after presentation/session recovery, preserve live execution and reading position. Primary owns diagnosis, implementation and local UI verification. No external model or subagent needed for this focused owner path.

## Acceptance criteria
- Original live view recovers without replaying the business task.
- Deterministic regression fails before the fix and passes afterward.
- Real MessageList/Virtuoso WebKit regression preserves reading position on recovery and shows content without wheel input.
- Latest remote main contains accepted code; desktop publication goes through existing owner 01a12bc2-907a-7702-b6dd-788225c5dfe4.

## To Do List
- [x] Verify runtime: private 0.5.16/516.6, source 97aecd086e896484409fa20000bf108d490917e3; original view has populated AX and blank screenshot.
- [x] Recover original live view with a single wheel input; no restart/replay.
- [x] Reproduce raw itemsRendered before DOM commit; commit-boundary handoff fixes it.
- [x] 101 focused DOM tests, scoped ESLint, TypeScript, test classification and routed-doc checks pass. Full real WebKit scroll audit and new blank/recovery/wheel audit pass.
- [x] Commit and remote branch verification: functional SHA `c5eee9fe97ece51e97f8a18ce3defe32cbd45349`, branch `codex/chat-blank-20261022`.
- [ ] Owner-coordinated main/CI integration and remote main ancestry verification.
- [x] Release/main/CI intake request delivered to desktop owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`; this is delivery of request, not acceptance or publication.
- [ ] Native acceptance of newly packaged code on the original long session.

## Completed
Original view recovered at 2026-10-22 about 01:18 Asia/Shanghai. CUA screenshots and accessibility observations distinguish existing messages from missing paint. Current source worktree is isolated from the active release candidate.

## Blockers and unknowns
Exact original internal fence cannot be read through native AX. Real WebKit confirms 6 pre-commit row announcements on baseline and 0 after repair. Baseline full scroll audit also reproduced a 5px late clamp after final motion settlement. Existing motion owner now coalesces a late scroll notification only while following with no active frame; reading intent and settled geometry do no work. Full WebKit audit now passes. Exact original native internal state remains unobservable through AX; packaged fix still requires native acceptance. Shared CI/build/release remains owned by existing desktop publisher; no runtime restart, business write or credential output authorized here.

## Additional user requirement
Scrolling must stop after wheel release while the live task continues. Original native view was left in reading mode and two screenshots stayed identical. No original business task was interrupted.

## Verification evidence
- Baseline deterministic test: newly announced row absent from DOM, expected true / actual false.
- Baseline real WebKit: 6 announcements before DOM commit; log `dev-docs/chat-blank/baseline-webkit.log` (local, ignored).
- Final real WebKit blank/recovery/wheel: `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/moxbots-blank-verification-S38uRP/results.json` and `last-frame.png`. Five restore cycles, zero missing rows, zero uncaught errors, 8 samples under continuing output with no reader movement.
- Full WebKit scroll: `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/myagents-scroll-verification-cZP1im/results.json`, screenshots/video. Smooth/rapid follow, active cancellation, reduced motion, height seeds, reading, footer/viewport growth, navigation, terminal and shrink checks pass.
- Each new deterministic test failed before its repair. First commit-handoff browser attempt revealed repeated equivalent list notifications; semantic snapshot deduplication prevents a render loop. Final browser has no uncaught errors.
- Status-row browser assertion uses the same 1px rounding tolerance as settled scroll and anchor checks, replacing strict subpixel equality.

## Execution record
Single primary, zero subagents and zero external-model calls. Scope is tightly coupled to list commit and motion ownership. No model switch claimed; usage/cost not exposed. UI review is primary-owned for this bounded repair; native newly packaged acceptance remains open. Preserve the commit boundary and explicit reading intent; future regression must include the actual virtualizer, because hook mocks hid the early notification.

## Next
Commit and push only this task branch (no automatic CI for codex/**); existing desktop owner coordinates PR/main CI and next candidate inclusion. No formal version, shared build, original task interruption, publication or replacement initiated here.

## Release intake
Desktop deployment unit remains exclusively owned by `01a12bc2-907a-7702-b6dd-788225c5dfe4` (MoxBots桌面端统一打包负责人). Its latest snapshot reports 516.7 already built and signing/notarization active; inclusion of this later fix is unverified and must enter an unfrozen batch. This development chat did not start shared CI, PR, official build, publication or install. No new version assigned here. User-visible issue remains open until new native package acceptance.
