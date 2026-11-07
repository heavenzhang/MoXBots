# MB-BRIDGE-PRECONTENT-RECOVERY-20261107

## Problem and behavior

A real original-session request failed before response headers with UND_ERR_SOCKET. The local bridge returned 502 and generic fast recovery was disabled. Known old uncertain operations were sufficient to prevent generic inference replay; this does not identify the provider/proxy component that closed the connection.

The change grants only current-attempt recovery for a new admitted Chat Completions request with client function tools and a native socket failure before headers on its initial dispatch. Old operation records remain unchanged and enforce their original fence. It consumes the existing four-attempt budget and configured auto candidates; manual model selection is retained. No new short header timeout, durable wait, stream replay, context compaction, ledger cleanup, or operation permission is granted. A POST may already have incurred model computation/cost, so the proof is not HTTP exactly-once.

## Evidence

- Corrected known-uncertainty loopback fixture against the unchanged base ModelFailover reproduced 502 instead of success for both buffered and streaming requests; patched source restored after the baseline run.
- Patched ModelFailover unit suite: 88 passed. Includes finite attempts, duplicate SDK requests, absent/stale proof, invalid status/body, partial stream, and owner/route/Stop/background/policy/deadline revocation.
- ContextRecovery unit regression: 68 passed.
- ModelFailover, connection retry and Session policy integration suites: 103 passed. Real socket closures verify recovery, exhaustion, missing owner, unsafe history, after-header failure, partial SSE, Responses exclusion and redirect exclusion. Existing direct TLS and ProxyAgent CONNECT/TLS cases remain passing.
- TypeScript noEmit passed; affected-source ESLint passed (final added script/test lint recorded in task verification).
- Actual SDK/native Bash loopback `--pre-response-socket`: PASS, four failed initial-route POSTs, one candidate switch, five distinct inferences, package write count 1, original unknown launch count 0, old uncertainty count 1. Reloaded journal still blocks old unknown and repeated completed write. Both ordinary and returned-native-result projection-gap modes passed. Synthetic provider, no paid call or user data.

Initial test preparation incorrectly modeled a newly untracked action instead of known old uncertainty; it correctly remained blocked and the fixture was corrected. An intermediate target clone changed object identity used by two existing tests; conditional cloning restored the original no-capability behavior. A test SSE fixture originally omitted finish_reason and was rejected as incomplete; corrected to a valid terminal. These were not waived or hidden.

## Delivery boundaries

Base 4ceeb2d21acc164487ef199b4a5788d7d27c65f1; branch codex/bridge-precontent-recovery-20261107. Sole desktop release owner 01a12bc2-907a-7702-b6dd-788225c5dfe4. This source is excluded from already-frozen 543.4. Remote main, shared CI, signed artifact, installed-client and real-provider acceptance remain pending owner integration. No general guarantee that external providers stop returning 502 is claimed.
