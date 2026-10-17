# MOXBOTS-BACKEND-RECOVERY-20261017 — metadata acceptance

Scope: `services/agentnet/metadata-core/**` and `services/agentnet/src/network_http.rs`. Source base `348251b3ce990dfbd0e0888d140477c6ed353f83`; no protocol/schema/archive edits, model calls, credentials, production access, commits, or deployment by this worker.

## Implemented behavior

- Fixed-protocol `PATCH /v1/networks/:network/mounts/:mount` supports exactly one explicit enable/disable or description mutation. Live AuthStore/DPoP/device checks remain in the existing HTTP owner. Membership plus enable/description revisions use CAS; mutation receipts persist atomically and retain existing replay/tombstone semantics. Closed typed decoding rejects duplicate keys, unknown fields, and absent required description; protocol validation rejects mixed mutation forms.
- New catalog mounts default disabled. Removed/omitted catalog entries, changed exposure revisions, and device leave clear enabled policy with an incremented enable revision. Mount identity and description remain durable; restoration/rejoin requires explicit reenable.
- `GET /v1/networks/:network/callable-agents` and `GET /v1/networks/:network/callable-agents/:mount` return same-principal/network targets only when joined, Ready, enabled, active, and backed by the current intact durable catalog ACK. Selectors use the vendored `AgentReference::encode`. `signedBinding` is null as allowed by the fixed schema; the existing live device-address path supplies peer binding authority.
- Callable cursors retain bounded snapshot membership but recheck each target against current permission/epoch/catalog before returning the page. Disabled/offline targets cannot leak from a frozen cursor.
- `with_callable_mount` holds the metadata mutex and SQLite transaction while validating the target and executing the relay's synchronous control commit callback. The callback cannot await, do IO, or reenter metadata. The read-only transaction is dropped after the callback so no fallible DB commit or post-commit expiry check can turn an already committed control transition into a reported failure. The outer caller must retain the live AuthStore session gate and validate actual relay endpoints.
- HTTP capabilities default empty. `NetworkService::enable_return_routes()` shares an atomic gate across clones; only a successfully initialized relay owner may open it. Enabled HTTP capabilities are `tls13-mtls`, `typed-rpc`, `permit-v1`, `return-v1`, `return-resume-v1`. MetadataStore itself does not claim relay authority.

## To Do / evidence

- [x] Metadata implementation and 4 new behavior regressions; 25 total unit tests passed.
- [x] Metadata clippy all targets with `-D warnings` passed.
- [x] Rustfmt on the three owned Rust files; `git diff --check` passed.
- [x] HTTP route/signature/CAS/scope/schema regression and relay capability gate regression: 10 network HTTP tests passed.
- [x] Lead connected the capability gate after `RelayController::new` succeeds; capability regression passed. Permit/return/resume combined acceptance remains lead-owned.
- [ ] Mainline/remote delivery: lead-owned, outside worker write authority.
- [ ] Real client/production acceptance: outside this worker scope; no claim from in-process fixture tests.

Non-sensitive verbose verification logs: `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/backend-recovery-20261017/metadata-tests.log` and `metadata-clippy.log`; `metadata-http-tests.log` is stored beside them.

Execution: one bounded metadata worker; selected Sol/high per lead dispatch due concurrent authorization and CAS risk across metadata/HTTP. Actual runtime model identity, tokens, costs, and comparative savings are unavailable to this worker; no external model was called.
