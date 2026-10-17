# AgentNet mobile notification core

This crate defines bounded registration and notification-hint contracts plus a
private SQLite endpoint/outbox owner. `services/agentnet/src/mobile_notification_http.rs`
is the authenticated service adapter; the service mounts its routes only when
notifications are explicitly enabled with a configured provider. The delivery
worker contacts fixed APNs/FCM endpoints, but no credentials or production
sends are part of this task. Neither crate inspects Host session content, proves
a Host software role, or executes a Session action. Cold-start restoration
remains separate.

## Authority boundary

`Authority` and `FreshEndpoint` are ordinary Rust values, not cryptographic
capabilities. This crate does not consult `AuthStore`, `DeviceStore`, live relay
state, or current Host/session ownership. The internal HTTP adapter creates
these values only after checking the live AuthStore session and exact
DeviceStore owner, identity binding, and generation. Each register, revoke, and
redeem operation performs that check. A future delivery worker must repeat it
immediately before claiming/sending a delivery. Never deserialize authority
values from HTTP, Host, push, or mobile input. Store matching is defense in
depth, not an authorization decision.

The source HTTP contract requires a fresh AuthStore session and current
DeviceStore row, then binds a `RecoverQuery` PoP challenge to the exact source
event ID, connection-epoch metadata, Agent ID, and Session reference. Only a
valid signature from the currently enrolled device key can enqueue the hint.
The connection epoch is stable deduplication metadata, not an old-connection
authorization token. This proves device-key possession, not Host software role
or the truth of the claimed Agent/Session relationship. It does not add a
WebSocket control message, change the frozen relay protocol, or let the blind
relay decrypt opaque TLS application traffic. Host lifecycle owners must
establish the real Agent/Session relationship before relying on the hint.

## Contracts and privacy

Registration v1 accepts `version`, a fixed provider enum
(`apns-sandbox`, `apns-production`, or `fcm`), a stable installation UUID, and
a bounded opaque token. The installation ID lets one app installation rotate
its token in place for the same provider; rotation invalidates old delivery
claims while retaining the endpoint row. Identity and account scope are never
client fields. Token bytes are stored in
this SQLite database under the service's private state directory; the current
service has no independent application-encryption key for this data. Do not
reuse the signing key. Tokens are redacted from `Debug`, never included in
projections or fixed error messages, and must never be logged by callers.

A source hint v1 carries `sourceEventId`, `connectionEpoch`, `agentId`,
`sessionId`, and the fixed `attention-required` kind. Agent IDs follow the
mobile wire contract: 1–256 ASCII letters, digits, or `._:-`. The target device
therefore matches the attesting device authority while the Agent ID
disambiguates multiple Bots on that device.
The source-challenge store deduplicates by full principal/network/device/binding/
generation scope plus source event ID and retains a digest of epoch and pointer
for seven days; reuse with changed content is rejected. The hint outbox also
deduplicates by principal/network + source device/binding/generation + source
event ID; reuse with different pointer content is rejected. A server-generated
random `eventId` identifies the resulting notification. The provider envelope
contains exactly `{ "eventId": "..." }`. Private target/session references
remain in the local outbox and are returned only to a freshly authenticated
recipient by `redeem_hint`; callers must then refresh targets and the Session
snapshot and require a separate human approval. Redemption itself is not an
approval and never executes an action.

Source challenges expire within five minutes, with at most eight pending per
device and 10,000 retained globally. Cleanup runs in fixed 100-row batches;
finalized proof receipts are retained for the dedupe window. A finalized receipt
is reused only under a fresh identical authority and the same proof digest.

## Bounds and delivery semantics

The crate caps tokens at 4 KiB, active registrations at 10 per account and 3
per device, all endpoint rows at 10,000, all event rows at 20,000, all delivery
rows at 100,000, event lifetime at 24 hours, active events at 128 per account,
delivery fanout at 2,048 outstanding rows per account, claims at 20 per call,
leases at 5 minutes, and attempts at 5. Expired events cannot be redeemed or
claimed. Expired leases return to the bounded retry queue. Provider outcomes
may be duplicated or unknown; all retries retain the same event ID and carry
no business action. Revocation/generation retirement revokes outstanding
deliveries. Deduplication tombstones are retained for seven days, after which
old source IDs may be accepted as new events. Cleanup updates at most 250
events and deletes at most 1,000 delivery rows, 250 event rows, and 250 revoked
endpoint rows per transaction; capacity checks reject new rows while cleanup
backlog remains.

The database follows AgentNet's private-state pattern: existing 0700 owner-only
directory, no-follow 0600 database file, SQLite WAL, `synchronous=FULL`, foreign
keys, and bounded immediate transactions. No provider credentials or network
client are part of this crate. APNs signing material, FCM service credentials,
native permissions, real-device delivery, and cold-start acceptance are later
separate gates.
