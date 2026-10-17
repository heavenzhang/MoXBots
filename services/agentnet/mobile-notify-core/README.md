# AgentNet mobile notification core

This crate defines bounded registration and notification-hint contracts plus a
private SQLite endpoint/outbox owner. It does not register HTTP routes, contact
APNs/FCM, inspect Host session content, authorize a Host, or execute a Session
action.

## Authority boundary

`Authority` and `FreshEndpoint` are ordinary Rust values, not cryptographic
capabilities. This crate does not consult `AuthStore`, `DeviceStore`, live relay
state, or current Host/session ownership. A future service adapter must create
them only after a fresh check of the active AuthStore session and exact
DeviceStore owner, identity binding, and generation. It must repeat the live
check immediately before claiming/sending a delivery and before resolving a
hint. Never deserialize these authority values from HTTP, Host, push, or mobile
input. Store matching is defense in depth, not an authorization decision.

The event source contract is intended for a separately authenticated owned-HTTP
extension (or authenticated local Host IPC followed by that extension). It does
not add a WebSocket control message, change the frozen relay protocol, or let
the blind relay decrypt opaque TLS application traffic. The service adapter must
verify the source Host connection/epoch and same-principal/network audience
before calling `enqueue_hint`.

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

A Host hint v1 carries only `sourceEventId`, `sessionId`, and the fixed
`attention-required` kind. The separate non-deserializable `TargetScope` is
constructed from the verified Host authority and the service-verified Agent ID
that owns the Session. Agent IDs are limited to 1–256 Unicode characters with
no control characters. The target device therefore matches the verified Host
authority while the Agent ID disambiguates multiple Bots on that Host.
The store deduplicates by principal/network + source device/binding/generation
+ source event ID; reuse with different content is rejected. A server-generated
random `eventId` identifies the resulting notification. The provider envelope
contains exactly `{ "eventId": "..." }`. Private target/session references
remain in the local outbox and are returned only to a freshly authenticated
recipient by `redeem_hint`; callers must then refresh targets and the Session
snapshot and require a separate human approval. Redemption itself is not an
approval and never executes an action.

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
