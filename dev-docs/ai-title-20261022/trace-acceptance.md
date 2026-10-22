# MOXBOTS-AI-TITLE-20261022 — title generation evidence follow-up

The functional request-admission title repair is already in main. The existing signed519.2 native case shows a content summary, auto/attempt metadata and a reported history reopen, but its owner explicitly records that the title utility call/return was not captured. This follow-up supplies that missing observation for a later immutable artifact; it cannot retrofit proof into519.2.

## Change

The existing generator emits request, SDK/runtime terminal and returned-result fingerprints through Node UnifiedLogger. One random generation ID joins the events; Product Session and utility Session IDs remain distinct. Builtin logs the prepared Provider ID, requested model and SDK-reported model IDs. External execution retains its original runtime/auth source and receives only the Product Session correlation; it does not pretend to know CLI-owned provider credentials. Prompt/raw-return/cleaned-title text is never logged: only presence, Unicode code-point length and UTF-8 SHA-256. The old external plaintext-title completion log becomes this content-free result event.

No new SDK request, tool, persistence authority, route, setting, retry, timeout or credential behavior is introduced. Main-task execution, title cleaning/budget, admission policy and manual-title CAS are unchanged. Logging failures do not change results or cleanup; cancelled/unsuccessful output cannot be certified as a successful returned title. A standalone utility call without Product Session identity remains unbound rather than borrowing an unrelated ID.

## Local verification

- [x] 39 affected tests in three files: generator SDK/runtime mocks, service policy and isolated actual V2 Store/reload. Seven new cases cover trace/correlation/privacy, unsuccessful terminal, generic-utility separation, standalone identity, diagnostic-sink failure, late cancellation and external result correlation.
- [x] Full TypeScript, scoped ESLint, test classification.
- [x] Dependency boundary scan: zero errors, eighteen pre-existing warnings; new helper uses the existing logger-context leaf, not a second log writer.
- [x] Source review: no added inference, no prompt/routing changes, retained cleanup and runtimeSource, and explicit Product Session forwarding. Initial integration expectation failure retained in local raw logs, then corrected to require the new correlation argument; all39 pass.
- [x] Implementation commit exact remote/handoff gate passed; final documentation-only head rechecked after push.
- [ ] Owner review/shared CI and main integration.
- [ ] Owner next unfrozen desktop version/artifact, formal publication and installation.
- [ ] Real Provider/native acceptance on that updated artifact.

These checks use fake SDK/runtime responses; they are not a real Provider invocation. Dependencies were reused from the existing validated installation with Vitest cache disabled, not freshly installed. The old430 tests were not broadly repeated. Private logs, client data, original native screenshots and binaries remain outside Git in the task workspace.

## Real acceptance

The existing sole desktop/macOS/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4 allocates the next unfrozen batch and controls CI/main/build/sign/notary/install/publication/rollback. Original head2df,519.1/ef33 and519.2/main54/TAR7624 stay unchanged. This source contains a Sidecar change and needs a new chosen artifact; do not relabel or rebuild a frozen version.

After that artifact is formally installed, use one new controlled Session with leading record-time/steps and the later fictional reimbursement submission network-error topic. Request only text, no tools/network/files/business actions. Keep the configured authorized Provider/model and all original business histories/drafts. Do not manually supply a title or replay the original business request.

Read actual original logs with the same generation/Product/utility identities. Require actual successful Runtime/SDK terminal, generated result, matching returned-title hash and actual Store title, auto source/attempts, sidebar/tab agreement and leave/reopen persistence. Model routing and SDK-reported IDs must be represented accurately, with running executable/version/binary/archive/tag/source correspondence. SDK trace alone is not proof of remote billing, Store persistence or publication. Partial old candidate evidence does not satisfy this updated-client chain. Stop the task heartbeat only after all original delivery gates pass.
