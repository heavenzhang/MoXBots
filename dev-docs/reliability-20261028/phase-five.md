# MB-RELIABILITY-20261028 — phase five

## Scope and finding

This phase adds a repeatable, explicit native fault matrix; production `src/` is unchanged from phase four, parent `8cfe7b00815bbc1721a5e0d262e51ced1b7867d4`. The older stream and cold-recovery smoke fixtures omitted the exact native owner and tool-use ID required by phase three. The initial stream run failed closed before its durable continuation checkpoint. Both fixtures now bind their actual SDK session UUID, live Query generation and hook tool-use ID; no production guard was weakened.

The stream fixture now supports two consecutive interruptions. It checks that both waits retain one chain, original root and absolute deadline, record the existing 15s/30s policy, preserve the completed tool result, reject duplicate calls with fresh IDs, and finish only once. Its second-wait Stop variant checks that no subsequent provider call occurs. The existing cold fixture reconstructs a Query from persisted waiting intent and the same SDK native history; it does not simulate a whole-machine power failure.

## Completed verification

The explicit runner `scripts/verify-reliability-matrix.mjs` ran ten scenarios ten times: **100/100 PASS**, all native counters exactly **1**, zero failed scenarios. Results were recorded from 2026-10-28T17:47:42.632Z through 17:49:00.620Z. This is a repeated bounded race check, not a long-duration soak or a statistical reliability guarantee.

| Scenario | Runs | Main assertion |
| --- | ---: | --- |
| One stream interruption | 10 | Original turn completes, confirmed action not repeated |
| Two stream interruptions | 10 | Same deadline, two continuations, one final success |
| Synthetic Goal owner, twice | 10 | Fixed Goal identity and original budget retained |
| Stop during second wait | 10 | Paused terminal, no later upstream dispatch |
| Availability Query reconstruction | 10 | Same native history, original wait/deadline, counter=1 |
| Native failure while background work exists | 10 | Exact native result can settle its own admission |
| Successful receipt persistence failure | 10 | Reload retains uncertainty instead of replaying |
| Provider cooldown and SDK repeat | 10 | SDK repeat adds no failing upstream call |
| Delivered stream failure | 10 | Partial output does not authorize replay |
| Stop during short retry | 10 | Retry interrupted, no fallback or repeated action |

Two-interruption normal runs made six upstream requests, denied two duplicate actions and emitted one final success. Second-wait Stop made four upstream requests, denied one duplicate, retained paused evidence and emitted no success. The cold fixture resumed its same native session and denied two duplicate attempts while retaining counter=1.

TypeScript, scoped ESLint and whitespace checks passed. Source hashes and all 100 log hashes were verified after the matrix. Phase-four 490 tests remain the prior product regression evidence; they were not rerun in this test-script-only phase. No new production files, dependencies, UI, default test-pool entries or CI triggers were introduced.

Reproduction (an existing output directory is refused):

```sh
node scripts/verify-reliability-matrix.mjs --out /absolute/new/private-evidence-directory --rounds 10
```

The runner serializes isolated SDK children, stops on the first failure, and writes source/log SHA256 values plus full scenario receipts. Each child owns its private HOME and local synthetic provider. Per-child termination bounds apply only to spawned fixtures. Private evidence: `work/MB-RELIABILITY-20261028/phase5-matrix-100/result.json`, the 100 adjacent logs, `phase5-*.log` and `phase5-evidence-manifest.json`. Raw SDK transcripts stay outside Git.

## Evidence limits and delivery

These runs use actual SDK 0.3.296/native MCP or shell with synthetic providers and compressed clocks. Goal identity and persistence in the stream/cold scripts are fixture implementations. They do not certify production Rust Goal scheduling, production persistence under power loss, signed/installed UI, real provider availability, business idempotency, or historical unknown-operation reconciliation. Original business sessions and installed MoXBots were not modified.

- [x] Exact native fixture wiring and two-interruption/second-wait Stop checks.
- [x] Repeatable native matrix, 100/100 with source/log hashes; type/lint checks.
- [ ] Existing owner source review, current-main integration and shared CI.
- [ ] Signed native artifact, real provider/network faults and sustained observation.
- [ ] Historical business receipts and complete cold-start/business recovery acceptance.

Branch `codex/reliability-20261028`; base `caab6ab648b434bee17930f90c4df4de87564bba`; observed remote main `775da22c196b5c72277469c3c1a357d360f030e6`. Phase five depends on phase four and its first-three-phase ancestors. One agent implemented and reviewed this phase, without delegated model calls. Inference was synthetic, with zero paid provider calls; agent token/cost totals were not measured.

The sole desktop/macOS-arm64/updater and shared-CI/main owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4`. The current frozen release is now **0.5.25/build525.2/r3**, source `cc21d4c925ee41b37a79aeb4ef4266db6a4ae104`, tree `77b60b263d5c8363c25fac83913fd62da6aac4b5`. This supersedes the 525.1 freeze noted in the historical phase-four report. Phases one through five are for the next unfrozen batch, pending owner review. This chat allocates no version and performs no shared CI, formal build, installation or original business replay. There is no phase-five formal artifact or digest yet.
