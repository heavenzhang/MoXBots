<!-- git-project-sync-task:source-digest=2620622de7dcb0465f120189ff5f6c0862d71e9729013f2bf32eeec4fb7db273 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=3e996f6f-d102-480d-a081-d2959e1932f8 -->
<!-- git-project-sync-task:branch=codex/recovery-phase19-20261102 -->
<!-- git-project-sync-task:base=82dffd887585ffc4c416e957906ba2778da87b55 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-INCIDENT-20261101 Phase19 proven connection establishment recovery

## Objective

MB-RECOVERY-INCIDENT-20261101 / Phase19: recover a fresh inference whose native TCP/TLS connection failed before the HTTP writer received a socket. Apply bounded reconnects to direct and provider-proxy paths and allow the existing automatic candidate chain to take over after exhaustion. Preserve original Session identity, completed work and exact uncertain-operation fences. No provider policy, credential, ledger or execution-time-limit migration.

## Acceptance criteria

- [x] Reproduce the installed 537.1 pre-TLS ECONNRESET path with real loopback sockets; original implementation makes one attempt and fails.
- [x] Direct and proxy paths reconnect at most twice, then use existing validated candidates for Anthropic, chat-completions and Responses.
- [x] No replay after a delivered POST, partial stream or redirect; abort, route, owner and policy changes revoke recovery. Old connector callbacks cannot authorize a new attempt.
- [x] Unknown old operations stay fenced; a distinct new inference can continue on the elected candidate; SDK duplicates remain sealed.
- [ ] Remote main inclusion, exact CI, immutable signed package, installation and original-session acceptance through the desktop owner.

## Completed

Native connector error identity is retained in a private WeakSet before socket handoff. Each request owns its retry dispatcher and dispatch count. A bounded connection failure is passed to the current ModelFailover attempt; it permits only the existing candidate chain, without multiplying HTTP retries or granting durable/stream recovery. See `specs/tech_docs/model_failover.md` and `dev-docs/reliability-20261028/phase-nineteen.md`.

## Verification

- `vitest run --project integration` for connection-retry, connection-failover, model-failover, buffered-tool-progress, proxy-pool, handler-timeouts and handler-prompt-cache: 7 files, 118 passed.
- `vitest run --project unit` for connection-failover and model-failover: 2 files, 94 passed.
- `tsc --noEmit`, scoped ESLint, test classification and `git diff --check`: passed on this source. Tests use synthetic loopback data and no real provider.
- Local raw red/green logs: `work/MB-RECOVERY-INCIDENT-20261101/evidence/phase19-*.log` in the coordinating workspace; no private session logs included in Git.

## Blockers and unknowns

Installed 0.5.37/537.1 still lacks this change. The actual original Max continuation failed with a native pre-handshake reset; source tests cannot close that acceptance gap. Max and scroll were re-read as `modelMode=auto`, matching the user's authorization. No claim of zero provider failures or completed original-session acceptance.

## Deployment request

- Required: desktop builtin client, macOS arm64 installed application and its existing update channel.
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence and dependencies: native connector contract from pinned Undici; synthetic acceptance above. No new package dependency or persisted schema. Freeze a new immutable artifact; preserve the existing application backup and original session/ledger records for rollback.
- Status: local implementation and simulated integration passed; remote main, shared CI, package and installed acceptance pending owner handoff.
- Owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4`, the existing desktop/shared CI/main/version/build/sign/install/native-validation owner. This development chat does not trigger shared CI, formal builds or application control.

## Next step

Independently review the exact remote source SHA, integrate through the existing desktop owner, allocate the next unfrozen version, and validate the unfinished original Max and salary paths after exact-artifact installation. Completed original sessions are checked for regressions without replaying their completed business operations.
