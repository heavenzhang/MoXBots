<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-channel-busy-1020 -->
<!-- git-project-sync-task:base=8e4c25928cb48b4a7417ea74c27512e566694655 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: REMOTE-SESSION-1020-BUSY scoped channel contention

## Objective

Continue the original remote-read incident by fixing proven cross-device channel contention and distinguishing transport contention from target Session execution. Preserve exact device/account scope, profile isolation, active work and unknown mutation outcomes. Base main8e4c25928 includes login PR163; that source integration is separate from installation and real remote acceptance.

## Acceptance criteria

- [x] Scope-validated pending Offers are attributed to the complete candidate peer before certificate verification; another peer cannot block this target.
- [x] Same-peer, unattributed and existing-channel reservations remain fail-closed; no idle reclaim, profile switch or remote task stop.
- [x] Candidate memory is charged and failed admission releases only its reservation.
- [x] Transport busy copy differs from remote execution busy; native diagnostics contain only stage/method/finite reason/aggregate count and are bounded to one per30s per connection.
- [x] 18 focused DOM +10 unit cases, full TypeScript and scoped ESLint passed. Independent source review accepted.
- [x] Same-source portable Pairs regression23/23 passed including5 new cases and existing real TLS/profile preservation.
- [x] Same-source portable management-controller9/9 and project Clippy redline checks passed.
- [ ] Full desktop macOS gate remains with the designated CI owner because local AppleMetal/Swift linking is unavailable.
- [ ] Branch/commit synchronized and CI/main request handed to sole owner.
- [ ] Exact-source project CI, main containment, unified version/release and original real remote read accepted by designated owners.

## Completed

Primary owns pairs.rs, actor.rs, management_controller.rs, RemoteSession rendering/i18n and focused tests. Existing read-only reviewer login_review accepted the source diff, final log-owner handoff and3-way UI distinction; aggregate field labels distinguish latest reason from total mixed-cause count. The reviewer confirmed the unrelated pending-offer false block and rejected unsafe local-only idle reclaim. No new external model or implementation worker. Native requested reviewer model/effort retained from earlier package; actual usage/cost unknown.

## Verification

Local checks:18 DOM and10 unit passed, final TypeScript/scoped ESLint passed. Existing test resource setup reused only as non-executed ignored inputs; existing signed CLIProxy inputs remain strictly verified. Local full desktop tests compiled but linking failed on missing AppleMetal Swift compatibility symbols; this is retained as an environment blocker, not a pass. Same-source headless Pairs tests23/23 passed. Management-controller9/9 passed; project-required Clippy flags `-D clippy::disallowed_methods -D clippy::disallowed_macros` passed. An extra stricter `-D warnings` attempt found an unchanged8-argument connector function; its failure is preserved, and no new allow/lint suppression was added. Tests cover candidate full scope, responder direction, unknown reservations, invalid scope, allocation failure, live pair preservation and bounded diagnostics. DOM tests distinguish channel busy/execution busy without dispatching mutations. Existing TLS/Agent preservation tests remain.

## Blockers and unknowns

Human latest screenshot has HOST_MANAGEMENT_TARGET_BUSY. Source emits this locally before Open, which does not prove Air is running another Session. Human did not confirm the reciprocal-view explanation; no further tab closures/repeated login requested. Native pending/channel cause cannot be established from old installed0514 logs; new aggregate diagnostic makes it observable. Air is currently0511 and its local toggle was reported enabled. Earlier REMOTE_AGENT_UNAVAILABLE is a distinct target-side rejection, not proven repaired.

A same-peer Agent/management conflict remains possible under the existing one-profile-per-pair contract. Local idle/buffer checks cannot fence reverse in-flight admissions. Full concurrent remote control requires a separately reviewed compatible protocol/coordination decision; this patch does not silently recycle a peer channel.

## CI and deployment request

Repository https://github.com/heavenzhang/MoXBots.git, canonical main; task branch codex/remote-channel-busy-1020. Sole desktop-unit CI/deployment owner01a12bc2-907a-7702-b6dd-788225c5dfe4 under latest direct human AGENTS instructions. Shared native input also compiles into the headless connector; no wire/API change or coordinated version switch is needed, and no Host/cloud publication is requested by this desktop source handoff. Development performs only local checks, commits and evidence handoff; owner coordinates existing automatic CI and any main integration/candidate/versions/build/install/rollback. Existing cloud owner01a12b99-7b38-78b1-831f-9c60257d386a remains separate for cloud target. No product version allocated here.

## Next step

Commit and synchronize this reviewed branch, submit exact SHA plus these local checks and platform limitations to the designated desktop CI/deployment owner, and verify receipt/remote-main containment after its normal integration. Real original Air read must pass before closing the incident.
