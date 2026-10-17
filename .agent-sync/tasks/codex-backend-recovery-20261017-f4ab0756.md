<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/backend-recovery-20261017 -->
<!-- git-project-sync-task:base=348251b3ce990dfbd0e0888d140477c6ed353f83 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Complete relay terminal-return recovery and DSH approval guidance

## Objective

MOXBOTS-BACKEND-RECOVERY-20261017: complete negotiated terminal-return recovery on the owned relay, then correct DSH child approval guidance. Destination remains the user-approved https://github.com/heavenzhang/MoXBots.git main. Preserve same-account isolation, explicit Agent enablement, current Host management and existing Session owners. Never replay original start/send after uncertainty.

## Acceptance criteria

- [x] Verify actual repo, clean isolated branch, current main348251b3 and coordination/deployment boundaries.
- [ ] Extend existing metadata/relay owners with explicit mount policy, fresh permits and bounded recoverable routes.
- [ ] Verify both peers again after reconnect; reject identity/session/key/policy changes, expire offline results and deduplicate terminal delivery.
- [ ] Repair DSH prompt at its owning source, build a reproducible compatible artifact and retain approval/denial checks.
- [ ] Focused regression, real socket/TLS/runtime integration, independent review and primary acceptance.
- [ ] Sync current main, final-head CI/review, PR merge and remote main inclusion proof.
- [ ] Record production/signed-client acceptance separately, coordinate via the designated release owner.

## Completed

Source and baseline gates pass. Root owns relay/client integration and delivery; DSH worker owns DSH modules; metadata worker owns metadata-core and network_http. No overlapping writers. Both workers requested native gpt-6.1-sol/high for runtime/artifact and concurrent-authorization risks; measured token/cost data unavailable.

## Verification

Evidence: dev-docs/backend-recovery-20261017/. Verbose non-secret logs: original WPS MoxBot/output/backend-recovery-20261017/. Initial project-sync start passed. Unit/synthetic, actual native/socket integration and deployed-user-path states must be reported separately.

## Blockers and unknowns

Owned clients currently use management-only profile; turning on a server capability alone is insufficient. Existing sole desktop release owner remains01a12bc2-907a-7702-b6dd-788225c5dfe4. This task does not take over that target or interrupt the daily app. Production server target/ownership and safe deployment admission must be verified before changes; local isolated real-process acceptance can proceed independently. DSH upstream is read-only; immutable downloaded artifacts must not be modified.

## Next step

Implement relay metadata/permit/route contract, then exercise actual reconnect through existing owners before enabling capability and delivering main.
