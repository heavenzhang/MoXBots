<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/goal-settlement-backoff-20261021 -->
<!-- git-project-sync-task:base=31af12eb99349171ae700d58e758e3b36f9eae00 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-GOAL-SETTLEMENT-BACKOFF-20261021

Root SALARY-RECOVERY-20261020 owns this source fix. Desktop/updater CI, version allocation, build/sign/install/publication stay exclusively with Codex thread 01a12bc2-907a-7702-b6dd-788225c5dfe4.

- [x] Source identity, observe/start/task-init gates at main31af12eb verified. Existing WIP untouched.
- [x] Actual installed5158 log04:14 minute:1115 rejected settlement messages from two original Goal owners. Native TCP connect2ms succeeded, API unavailable cause remains under separate diagnosis.
- [x] Two deterministic original orchestrator regressions reproduce601 finalize calls/minute before fix, for transport throw and non-ok response.
- [x] Settlement-only exponential100ms to10s retry, failure log at most once/30s. Original durable claim/queue/body, confirmation barrier, Goal changed handling and no redispatch preserved. Claim admission cancellation timing unchanged.
- [x] Node24 exact26 orchestrator cases passed including original Stop/background/claim/terminal invariants. TypeScript noEmit passed; final lint/review tracked in handoff.
- [ ] Independent review; final source commit/push and sole publisher main integration.
- [ ] New exact CI/build/native/online acceptance; source-only does not prove management outage fixed.

Completion criteria: during outage retain original terminal barrier while bounding control traffic; management recovery acknowledges the same body without second business send. No Goal cancellation, ledger mutation or tool replay. Next: review source, hand off exact SHA to sole desktop owner for next unfrozen batch; keep local installed5158 and online014 distinct.
