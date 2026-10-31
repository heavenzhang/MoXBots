# MB-UPSTREAM-RESET-20261031

## Diagnosis and scope

At 2026-10-31 01:05:40 Asia/Shanghai the installed Anthropic bridge logged `ECONNRESET`, `route=direct`, `phase=response_headers`, `mappedStatus=502`, no timeout/cancellation, and zero delivered response bytes. The local bridge synthesized 502; no upstream HTTP status or request ID was received. Historical logs do not record socket reuse or TCP/TLS phase, so they cannot identify the reset issuer retrospectively.

The selected provider was excluded from the application's existing proxy scope. Local DNS used Clash Verge Fake-IP addresses routed through a TUN interface: application-level `direct` did not mean bypassing the local virtual network. Two credential-free fresh curl connections failed during TLS; the paired explicit existing-proxy calls received valid 401 responses. Later curl IPv4/IPv6, Node 24 fresh connections, and both direct/proxy pooled connections succeeded. Thus the network failure is intermittent, can happen without connection reuse, and is not evidence that keep-alive itself is broken. A persistent supplier HTTP outage was not reproduced. The exact historical reset source (local TUN, intermediate route, remote TLS edge) remains unproven.

## Live mitigation (configuration only)

- Existing application Settings → Network proxy → Custom scope was used to add only the affected provider to the already-configured localhost HTTP proxy.
- The config owner saved the change and broadcast it to running Sidecars. UI and disk agree; all non-proxy configuration hashes remained unchanged.
- The existing key was used in memory for one read-only `/v1/models` request through that proxy: HTTP 200, eight model entries. No model inference, business action, restart, ledger edit, or task replay was performed.
- Proxy-only before-state and sanitized local probes are in the private workspace `work/MB-UPSTREAM-RESET-20261031/`; they contain no credentials. Rollback is removing only this provider from the same UI scope, preserving the pre-existing provider selection.
- This is a verified route mitigation, not a guarantee against future network failures or a completed business-task acceptance.

## Source change

- Anthropic forwarding records per-attempt request-created, header-start, body-sent, response-header, elapsed-time and fresh/reused/unobserved connection evidence through Undici diagnostic channels.
- ALS associates exact requests; weak maps avoid retaining requests/sockets. No credentials, headers, bodies, URLs, IP addresses or socket objects are emitted by the new observer.
- `requestHeadersStarted` observes the event immediately before header writing; it is NOT proof of delivery/non-delivery, and never authorizes replay. Uninstrumented calls remain unknown.
- 502 presentation is neutral for unspecified gateway errors and gives provider-proxy/network guidance for the bridge's connection-error message.
- No retry budgets, action permissions, Query owners or durable ledger semantics changed.

## Recovery dependency and deployment

The affected session had uncertain prior actions, disabling `canRetryInference` and limiting tool admission to read-only reconciliation. A routing fix cannot settle that historical ledger. Existing `codex/replay-recovery-20261030` and the independently active `MB-REPLAY-SCOPE-20261031` implement evidence-based historical reconciliation and operation-scoped protection. Do not overwrite that work or substitute a blanket bypass. Existing desktop/shared-CI/main publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4` must jointly review compatibility and choose the next unfrozen candidate.

- [x] Existing API route and loopback process verified.
- [x] Fresh/pooled, IPv4/IPv6, direct/proxy probes; credentials excluded from evidence.
- [x] Live narrow proxy mitigation persisted; authenticated read-only API succeeds.
- [x] Loopback regression tests cover real fresh/reused sockets, reset after sending, refusal before sending, concurrent isolation, cancellation, upstream 502 and partial response failure.
- [x] Seven targeted files / 92 tests pass; full TypeScript, scoped ESLint, test classification and diff whitespace pass. Private raw logs: `/tmp/mb-upstream-reset-final-tests.log`, `/tmp/mb-upstream-reset-typecheck.log`, `/tmp/mb-upstream-reset-lint.log`.
- [ ] Remote source branch verification.
- [ ] Main/shared CI and signed desktop release by existing owner.
- [ ] Actual repaired error/recovery UI and same-session continuation after release.

## References

- Undici diagnostic event semantics: https://undici.nodejs.org/api/DiagnosticsChannel
- Node HTTP documents stale keep-alive resets as one possible cause, not a diagnosis of this incident: https://nodejs.org/api/http.html

## Root integration correction — proxy CONNECT scope

The primary independently reproduced an attribution defect before any main merge or formal build: ProxyAgent emits nested CONNECT requests inside the same async scope, so tunnel header/body events incorrectly marked the target HTTPS request as sent when TLS reset before the target POST. The first isolated probe reproduced it; the first Vitest fixture was correctly rejected by the no-egress guard, then a loopback-only target reproduced the actual assertion failure. Those originals are retained privately.

The observer now binds the first non-CONNECT application request identity with a weak set. Internal tunnel events cannot update that target observation. No credentials, header/body content, address or replay authority is added. Seven observation tests plus five actual Anthropic diagnostic tests pass, including CONNECT-then-TLS-reset and successful tunnel fresh/reused target connections. The R1 PR/source remains immutable evidence but is withheld from main; wait its original jobs terminal before a normal FF update of the same PR and new exact-head CI. Build528.1 has never been formally built.
