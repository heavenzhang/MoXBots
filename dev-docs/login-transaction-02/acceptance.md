# MOXBOTS-LOGIN-RETURN-02 verification and handoff

## Scope and incident

The Air browser attempt reached the server's original enrolled device, produced a session and that session was revoked 33 seconds later. This is not proof of the exact device-side failure. The user reports version 0.5.15; device-side build/log commands returned no output. Historical service metadata says 0.5.13 at its earlier update, so it cannot establish the current bundle build. The earlier Mac-mini515.8 success remains evidence for that one device only.

## Source behavior

- Native owns one driver per accepted attempt, independent of WebView polling/focus. UI only observes phases. Reopening attaches to the same valid intent; view removal does not cancel it.
- Opted-in service polling returns the same device/PKCE-bound live session until native commit ACK. Legacy clients retain strict response compatibility and one-shot delivery. Lost legacy consumption stops with a restart requirement.
- Received grants survive recoverable local/identity errors; persistence can be retried without another browser grant. Staged validity can exceed the browser transaction deadline, but remote replay/ACK retain their original TTL.
- Commit receipts contain no bearer. Explicit cancellation and real account/trust/lifecycle changes remain fenced. Late cleanup cannot revoke a committed login; a paused prepared grant must be revalidated against remote revocation before publishing authentication.
- A delayed first login preserves a user's later network selection. Presentation selection never substitutes for issuer/principal/trust/binding checks.

## Local verification

- Renderer/API focused regression: 121 passed, 0 failed. Covers native phases, actionable save retry, terminal errors, unmount detach, exact existing-account entry, legacy restart message and staged reattach after browser expiry, expiry during save retry a suspended view observing a successful native commit after its old browser deadline, and restart after cancellation fails while an old observation remains in flight.
- TypeScript `tsc --noEmit` and targeted ESLint: exit0. AgentNet protocol and routed-agent-doc verification: exit0.
- Isolated Playwright on the actual dialog component: 1280×900 and390×844 pause/retry paths, no document overflow or page errors; retry resumes the same synthetic attempt. Theme runtime was initialized and screenshots inspected. This is UI-only synthetic evidence, not real authentication.
- Service: 203 passed, 0 failed, 8 existing opt-in/manual tests ignored; Clippy with warnings denied and rustfmt passed. One unrelated notification timeout failed during the first parallel run and passed separately and in the full serial run. Exact commands and boundaries: [service-verification.md](service-verification.md).
- Native default-profile exact-source verification: `cargo check --lib --tests` passed; Desktop32 + Registry22 + OwnedClient13 =67 passed,0 failed. Includes actual loopback staged503 recovery without reconsumption and prepared401 revocation rejection. Runtime needs this machine's Xcode Swift fallback path; this is a local test invocation setting, not a source or system change. It does not exercise a signed production credential reader or the Air Keychain.

## Independent review

Root owns client DTO/compatibility, renderer and integration and reviewed the service implementation. A separate native implementer owns manager/registry/commands; the service implementer reviewed native code without editing it. Publication/gate locking, same-grant recovery, cancellation/commit order, immutable receipts and later network-selection preservation were reviewed. Runtime model identity/token spend/cost savings were not independently measured.

## Release gates and owners

Desktop/CI owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Owned cloud service owner: `01a12b99-7b38-78b1-831f-9c60257d386a`. Preserve current frozen release batches. Submit exact source SHA to both owners; one coordinated combined CI lane, compatible cloud support before desktop rollout. Owners assign immutable versions/artifacts and record source SHA, run, digest and rollback target. No new port, credential permission or database migration is part of this change.

Pending separately: shared exact-SHA CI, actual main integration/remote verification, cloud publication, new desktop signed artifact/publication, and the original Air's one-pass real sign-in with unchanged identity, saved credentials, dialog dismissal and device Ready. A local test, CI or another Mac's screenshot does not close the Air gate. No production or Air mutation has been performed by this development task.

Local full evidence stays under the WPS project `work/MOXBOTS-LOGIN-RETURN-02/`; it contains incident facts, UI receipts/screenshots and test summaries, never credentials or authentication proof.
