# REMOTE-SESSION-1019 — management failure diagnosis

The reported `HOST_MANAGEMENT_TIMEOUT` is a 30-second encrypted management read deadline, not proof of a lost Session. On 2026-10-19 the installed macOS 0.5.11 client showed both devices online, but the same Agent's remote history could not be read. Native reproduction returned `CHANNEL_PAIR_EXISTS`; a later refresh returned `REMOTE_SESSION_RESPONSE_INVALID`. Local logs also recorded earlier reauthentication retries and metadata timeouts, followed by a reconnect recovery. These observations do not establish one causal chain.

## Confirmed source defect and repair

`remoteSessionRequest` accepted only `ResponseResult::RemoteSession`, although the Rust management owner can return a scoped `ResponseResult::Error` before a Session projection exists. Such a valid error was converted to `REMOTE_SESSION_RESPONSE_INVALID`, hiding the actionable owner error. A regression reproduced this behavior before the repair.

The renderer now accepts the closed management error shape, validates the complete response and signed target scope first, and preserves only its bounded error code for read operations. Mutation errors remain `REMOTE_SESSION_UNCONFIRMED`; there is no automatic write replay or relaxation of the original receipt reconciliation policy. Malformed, extra-field and wrong-target responses remain rejected.

## Verification

- 18 unit tests: remote API, owned Host management and shared Session schema passed.
- 15 DOM tests: existing RemoteSession behavior and a new actual API-to-component test passed. The new test exercises scoped owner failure, manual refresh and recovered history with synthetic Tauri responses; no real remote write or model call.
- Focused ESLint and full TypeScript results are tracked in the task record.
- No layout or theme changes. Primary agent owns this bounded error-projection check; no independent reviewer was used.

## Open acceptance

The daily installed application was not replaced or restarted; local and remote active work was preserved. MacBook Air's installed version and target-side transport/owner logs remain unavailable. Its `.local` name did not resolve from the investigating Mac, so no SSH access was established. The user was asked for its version and local Session availability. No target upgrade, production cloud change or connection reset was attempted.

This repairs loss of diagnostic information. It does not establish that the original timeout or pair conflict is fixed. The existing sole release owner must incorporate the change in a new unfrozen candidate and verify both real desktops, then open and refresh the original Agent history. Do not report remote-session recovery before that gate passes.
