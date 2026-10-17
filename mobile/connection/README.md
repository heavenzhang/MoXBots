# Mobile native connection owner

This crate is the native-only account, device identity, directory and outer HTTPS/WSS owner. It reuses the original AgentNet account, PKCE, identity, verifier, transport, policy and admission source by `#[path]`. It has no Node service, Host IPC, systemd, execution owner, global account selection, or credential environment fallback.

The native application installs `NativeConfig { issuer, publicTlsCa? }` and the callbacks in `include/mox_connection.h`. Production normally uses platform public TLS trust (`publicTlsCa: null`); the private device CA comes only from the authenticated descriptor/bootstrap and is used only by the shared SDK's inner TLS channel. No insecure TLS/WS fallback exists. Android must initialize the platform verifier using `mox_connection_android_init` and ship its matching Android verification classes before any request.

The native owner serializes requests on a worker queue. Store callbacks must be thread safe and durably persist before success; the application must exclusively own the store namespace. Original keyed identity gates serialize identical enrollment scopes across native handles within the process. Private keys are saved before issuer activation, compared against existing scoped keys, and read back before success. Account tokens and PKCS8 never cross the JS interface.

Closed version 1 intents:

- `account.status`, `account.login.start`, `account.login.poll`, `account.logout`
- `targets.list`, `operations.pending`, `connection.suspend`
- `session` with an opaque current catalog `targetId` and the exact existing `RemoteSessionRequest`

Raw C input is first decoded through closed typed DTOs, preserving duplicate and unknown-field rejection before JSON projection. Same-device/agent target IDs remain stable within the native handle across catalog refresh; logout and suspension clear the catalog scope. Directory snapshots close their idle outer WSS connection, and session requests obtain fresh epochs.

All requests return `{ok:true,value:...}` or `{ok:false,error:{kind:"error",code:UPPERCASE}}`. JS receives only account, login URL, target, pending operation or existing remote-session projections. Target runtime is `null` until obtained from actual Host session metadata. The directory is limited to 100 projected targets and signals truncation with `hasMore`. Unknown pending operations whose target no longer exists remain visible with an empty `targetId`; they cannot authorize a replacement target.

Login obtains a per-login device ID and PKCE verifier, validates the account session, then persists the native account. Device identity and pending enrollment keys use the original full issuer/environment/service/principal/device/generation scope. Joining is an explicit initial mobile enrollment grant persisted as consumed before the original join mutation; ambiguous joins are not retried automatically. The current native flow uses one fresh outer WSS epoch per completed session request; background suspension drops the mobile connection and never stops the remote Host.

Remote sessions resolve the device address immediately before channel creation and again before dispatch. Original signed peer bindings, validated offer direction, SDK inner TLS, flow credits, typed messages and responses remain authoritative. Respond fetches a fresh snapshot and matches the exact generation, turn, request and interaction; positive approval additionally requires actionable state, while explicit denial retains the original owner policy.

Mutations follow SDK prepare → durable native journal → commit. Unknown full records are bounded to 128 per issuer/service/environment/principal and survive key rotation or login device replacement. UNKNOWN/processing/not-found/unconfirmed never triggers automatic resend. Authenticated successful snapshots or accepted/rejected receipts replace the full record with a small confirmed marker and release pending capacity. Confirmed markers retain the operation ID guard; they do not consume the unknown-operation bound. Receipt lookup is read-only. Expired/revoked trust requires fresh authentication, never an offline target.

Validation:

```sh
cargo test --manifest-path mobile/connection/Cargo.toml --locked --lib
cargo clippy --manifest-path mobile/connection/Cargo.toml --locked --all-targets -- -D warnings
```

Tests use generated ephemeral keys, bounded loopback HTTP fixtures and a real pinned TLS WebSocket upgrade/DPoP/subprotocol exchange, including rejection of a foreign CA. The sibling SDK tests exercise actual mutually authenticated inner TLS in both relay directions. These tests do not establish a production user login, real mobile Keychain/Keystore behavior, or a real Host session effect; those are separate native/device acceptance gates.
