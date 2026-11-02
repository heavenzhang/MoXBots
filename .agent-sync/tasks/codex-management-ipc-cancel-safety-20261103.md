<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/management-ipc-cancel-safety-20261103 -->
<!-- git-project-sync-task:base=3dc40bbcf4a3e999372789f7a0f84f0d2e437c00 -->
<!-- git-project-sync-task:status=in-progress -->

# MANAGEMENT-IPC-CANCEL-SAFETY-20261103

## Objective and boundary

Retire the original private management IPC stream if a local-source request is cancelled while an exchange is in flight. The next request must not consume a previous response; preserve exact request ID, authority, UID and framing validation. No automatic replay or mutation retry is added. Shared CI/main owner is session 01a12bc2; Host deployment remains with its existing owner. Mobile build/sign/install is a separate owner decision.

## Evidence and acceptance

- [x] Preserve main-push run 41495813993 job 125450329857: renewal fixture failed with HOST_MANAGEMENT_RESPONSE_INVALID and no new Ready epoch. Prior same-tree PR CI passed; original cause cannot be established from those logs alone.
- [x] Reproduce the cancellation/stale-response mechanism with a deterministic isolated test. The first diagnostic invocation selected zero tests due to an exact-filter mistake; the corrected one-test run reproduced the failure mechanism.
- [x] Red regression observed stream left open; corrected implementation closes the in-flight stream on drop. Green test proves a fresh connection and matching response work. Original errors and normal communication tests remain covered.
- [x] Isolated renewal fixture reaches actual new Ready epoch; this is synthetic, not an installed client, live Host or real mobile acceptance.
- [ ] Independent review of source, cancellation semantics, tests and release impact; then exact-source CI and verified main.
- [ ] Existing owners decide separately whether Host deployment is needed and whether the signed mobile build must be rebuilt or can be accepted without that deployment.

## Next step

Review complete diff and evidence, including original failed strict clippy and corrected test-only lint fix; complete applicable tests and coordinate exact source CI once. Do not reuse CI from a prior tree or claim the failed main-push test passed.
