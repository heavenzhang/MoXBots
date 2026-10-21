# MOXBOTS-LOGIN-RETURN-02 — reliable login result delivery

## Incident and bounded scope

MacBook-Air c109… / original admin: server issued the original-device session at2026-10-21 12:27:46 CST and revoked it33s later. This proves browser authorization and native credential consumption occurred; exact Air failure cause needs its logs/build number. Mac-mini515.8 acceptance does not establish cross-device reliability.

Current native poll marks consuming before IO and has error exits that leave it stuck. Server removes a ready transaction before the client knows that its response was received. Renderer currently owns repeat polling. Fix delivery/lifecycle boundaries without replacing principal/device, storage authority, PKCE/trust verification or explicit cancellation fences.

## Owner and phases

The existing NetworkRegistry / OwnedLoginManager remains the native owner. A native driver owns AwaitingAuthorization → ReceivingGrant → VerifyingIdentity → SavingSession → Committed. UI polling observes this driver; it does not own remote token consumption. Explicit user Cancel and real identity/scope invalidation can cancel before commit; a committed attempt is immutable and late cleanup cannot revoke it. A token-free completion receipt permits repeated status reads after a successful command response is lost.

A received staged session is retained for in-place recovery; temporary network errors never strand consuming=true. Unknown legacy consumption must produce a clear terminal/restart-required failure, not endless pending. Credential authorization failures preserve identity and surface actionable errors; they must not create replacement identities or claim success. No system permission is bypassed.

## Additive service handshake

Desktop start opts in with `replayableResult:true`; server response echoes true only for opt-in starts and omits the field for legacy callers. Older servers may reject the optional field before creating a transaction; use bounded compatibility negotiation retaining existing desktop-return behavior. Headless/password/mobile legacy flows retain their original contract.

For opted-in transactions, the first valid PKCE/device-bound poll issues one session and retains that same response in bounded, zeroizing service memory until transaction expiry or client acknowledgement. Identical proof can re-read that response; it cannot mint additional sessions, cross devices, override identity or accept a revoked/expired session. No bearer enters browser URL, disk, logs or browser storage. Transaction TTL and cardinality bounds remain unchanged. Service restart invalidates unfinished transactions explicitly; this iteration does not claim restart-durable OIDC transactions.

`POST /auth/login/ack` takes the existing PollRequest proof fields. It succeeds only for the matching delivered transaction after native commit; repeated ACK is harmless. ACK drops the replayable token and retains only a bounded receipt until expiry. It never revokes an accepted session. Explicit cancellation before ACK revokes a delivered token; cancellation after ACK is a no-op, while normal sign-out retains its separate authenticated revocation endpoint.

The native owner ACKs only after credential write, config pointer commit and registry publication. ACK delivery failure must not roll back an already committed login. Retain its proof for bounded background retry/expiry, without exposing it to UI. Native cancellation that wins before commit remains an actual cancellation; no fake success is accepted.

## Acceptance gates

- Lost poll response followed by identical proof returns the same token/session and one AuthStore row.
- Wrong verifier/device fails; acknowledged or revoked sessions cannot be replayed.
- Identity-read/network/storage failures do not permanently wedge native phase; retry uses staged result when safe.
- Explicit cancel before commit retires the staged token; late cancel after commit does not revoke it.
- Native driver progresses without UI focus/timers; duplicate status checks cannot issue or install twice.
- Legacy desktop, password and headless flows remain compatible.
- Exact combined desktop/cloud CI, cloud-first compatible rollout, immutable new desktop artifact and original Air real-account path remain separate gates.

## Deployment ownership

Desktop/CI owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Owned cloud owner01a12b99-7b38-78b1-831f-9c60257d386a. Developers do not run either unit's shared CI/deployment. Cloud additive support precedes new desktop rollout; rollback retains legacy endpoint contracts and existing sessions. No production DB migration or new public port is introduced by this bounded in-memory result-delivery change.

## Standards boundary

External-browser authentication and PKCE remain required (RFC8252, https://www.rfc-editor.org/rfc/rfc8252.html). Token-poll success and user-facing authorization completion are distinct facts; explicit pending/expired/denied states inform this contract (RFC8628§3.5, https://www.rfc-editor.org/rfc/rfc8628.html#section-3.5). The acknowledgement extension is this product's contract, not a claim that it is an OAuth-standard endpoint.
