# REMOTE-SESSION-1020-BUSY

The original remote history incident remains open. The latest human screenshot reports `HOST_MANAGEMENT_TARGET_BUSY` on installed0514 while reading the same Air Agent. The code emits this error on the controller before Open; it does not observe the target Session's execution state.

## Confirmed repair

`Pairs::has_peer_channel` treated every pending Offer as a conflict, including Offers for another device. The actor now validates the Offer's outer local/account/epoch scope before reserving it, and records the complete opposite-end candidate scope until original certificate/binding verification installs the channel. Pending candidates for another full scope do not block this target. Same-target pending/installed channels and unknown reservations still block. Candidate bytes are charged to the existing memory owner; allocation failure releases only the new reservation.

The UI separates `HOST_MANAGEMENT_TARGET_BUSY` (channel contention), `HOST_MANAGEMENT_BUSY` (previous local management request) and remote execution busy. Native controller failures record a bounded static cause (`unattributed_handshake`, `same_peer_handshake`, `same_peer_channel`) for the original actor to log, with stage/method, `last_reason` (latest observed cause) and `blocked_total` (all causes since the previous emission) only, at most once per30 seconds per connection. No peer IDs, credentials, text, paths or new logging dependency.

## Validation and limits

- Same-source headless Pairs23/23, including5 new cases and original TLS/profile/credit/retirement coverage.
- Same-source headless management-controller9/9.
-18 focused DOM tests and10 API/account unit tests; final full TypeScript and scoped ESLint passed.
- Three modified Rust files pass scoped rustfmt; diff whitespace check passed.
- Existing independent reviewer accepted scope, memory cleanup and profile preservation; final log-owner and management-slot-copy increment accepted; reviewer identified mixed-cause count ambiguity and field names now state last_reason/blocked_total.
- Local full desktop test compilation reached the linker but AppleMetal Swift compatibility libraries could not link. No macOS full-test success is claimed. Test resources were local non-executed placeholders plus existing strictly verified signed CLIProxy bytes, never a release package.
- Extra `-D warnings` Clippy stopped at the unchanged8-argument headless connector function. The repository's actual redline Clippy flags passed without suppression.

Same-peer conflict remains a protocol boundary: one selected application profile per pair. A local idle observation cannot fence reverse in-flight invocations; automatic idle close would risk uncertain work. This patch does not close/recycle an active pair or switch its profile. It does not establish that the observed current busy was caused by another-device pending Offer, nor repair the earlier Air `REMOTE_AGENT_UNAVAILABLE` without further target evidence.

## Delivery

Canonical repository https://github.com/heavenzhang/MoXBots.git, base main8e4c25928cb48b4a7417ea74c27512e566694655, branch codex/remote-channel-busy-1020. Exact branch SHA and remote receipts are provided in the CI request after commit. Desktop-unit CI/deployment owner01a12bc2-907a-7702-b6dd-788225c5dfe4 assigns the unified version/candidate, organizes CI and normal main integration, and handles installation/rollback. Shared native source remains wire/API-compatible with old targets and the headless connector; no cloud/Host publication is requested by this desktop change. Development only ran local checks and will not create competing CI or a release build.

Original Air history/refresh and scoped mutation reconciliation remain real acceptance gates after the exact candidate is installed. Unit/component/TLS fixture results do not close them.
