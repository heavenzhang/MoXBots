# MOXBOTS-SESSION-STABILITY-20261024

## Scope and behavior

User authorized comprehensive repair after the read-only stability review. Base is main `71871fc57ee2c4f29b63931dc29654520aa3f6aa`; task branch is `codex/session-stability-20261024` in `https://github.com/heavenzhang/MoXBots.git`.

1. Both SSE wrappers continue reading through comments and partial records until downstream progress, terminal, EOF or controlled failure. UTF-8 streaming decode, cancellation, backpressure, native terminal handling and replay ledger remain intact. Context recovery uses the existing bounded body reader for SSE only.
2. Verified human inputs stage separate admission capabilities. Preparing/classifying B does not stop or overwrite live A. Pending human input blocks A's automatic continuation from overtaking it. Original native `beforeDispatch` CAS changes the ledger; synchronous final validation checks that exact admission. Each classified input uses the original turn-boundary queue, including when the ordinary UI queue preference is realtime: delivery to SDK before consumption cannot safely transfer an independent execution scope. Stop and force-send retain their original explicit entry points. Execution budget starts at promotion. Cancellation, rejected enqueue and failed query preparation release only their own capability and reconsider a safe existing continuation through its original gate.
3. An independent Task/Goal requires original native TurnIdentity plus current Query/owner authority. Its tool policy remains with that owner; it cannot borrow another ordinary execution's package or evidence. Native children require exact launch identity and must not match a managed ordinary-execution claim. Missing launch proof, stale Query/owner, forged queue/source and managed-child disguise remain rejected. Existing resource locks still apply to independent writers and delegation.
4. Intent read/control tools reuse the existing Plan gate's read-only and host-interaction sets. AskUserQuestion, EnterPlanMode, ExitPlanMode and LS can reach their existing host/permission gate. This does not grant Write/Edit/Bash/MCP/delegation or count host interaction as verification evidence.

No new execution store, scheduler, retry loop, implicit Goal or provider permission was introduced. The existing Stop, absolute budget, unknown outcome protections, exact task binding and root verification remain enforced.

## Verification

Runtime: bundled Node v24.20.0. Unit/integration projects install their existing no-egress setup; only synthetic sessions, private scratch HOME, in-memory streams and loopback HTTP are used.

| Gate | Result |
| --- | --- |
| New 17-case stability suite on clean archived base source | 15 fail, 2 pass (expected regression proof) |
| Same stability suite on repaired source | 17 pass |
| Related queue, execution, Task, Goal/owner, Plan, stream, recovery, failover, provider history and facade regression | 25 files, 673 tests pass |
| TypeScript no emit, no incremental cache | PASS |
| ESLint changed source/test files, max warnings 0 | PASS |
| Test classification | PASS, 458 server tests; 132 integration and 6 credentialed |
| Whitespace/diff review | PASS |
| Independent review | One SSE implementation worker also reviewed root changes read-only; missing child-launch proof was identified and tightened, then re-reviewed |

The new suite covers queued status/execute inputs, multiple pending inputs, cancellation/rejection/lost ACK, last-pending release, Stop, late old guard/cancel, promotion-time budget, native independent Task/Goal, unproven child and resource conflicts, host controls, and fragmented SSE. Existing execution tests now exercise admission before asserting active ledger state; obsolete assertions that preparing input must revoke the live root were replaced with the native-promotion contract.

Reproducible commands use `/Applications/MoXBots.app/Contents/Resources/nodejs/bin/node` with `node_modules/vitest/vitest.mjs run --project unit --project integration --no-cache --maxWorkers=2`, `node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, the changed-file ESLint command, and `scripts/check-test-classification.mjs`. Exact commands and raw logs are in the external evidence directory below; the task record carries the integration handoff. No model credentials, business data or machine secrets are versioned.

External local evidence: `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/work/session-stability-20261024/`. The earlier `review.md` is a historical pre-fix assessment; use `repair.md` for current repair status.

## Integration and acceptance ownership

Desktop/macOS/shared CI/updater owner remains thread `01a12bc2-907a-7702-b6dd-788225c5dfe4`. This development task does not trigger shared CI, release builds, version allocation, installation or channel switching. Package version remains `0.5.21` until the owner allocates the next candidate/build.

Concurrent owner PR 200 addresses first-input intent classification via default auto mode in builtin-adapter; it is separate from these four repairs and has no source overlap at the reviewed head `5493a1e21391802388b306824344241b9e2ab158`. The owner must include both changes in its selected candidate and rerun affected combined gates. Existing frozen 0.5.21 artifacts must not be relabeled as containing this repair.

Main integration, CI, candidate digest/version, actual installed runtime and authenticated real-user paths are distinct acceptance states. Local tests do not confirm them. Required real paths: first verified execute input, queued follow-up while A is active, cancel/Stop, structured clarification/Plan approval, independent Task/Goal and ordinary model output. Reuse controlled identities and data; never replay uncertain business writes.
