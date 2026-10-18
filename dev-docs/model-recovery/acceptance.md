# MOXBOTS-MODEL-RECOVERY-001 acceptance

Date: 2026-10-19. Repository: https://github.com/heavenzhang/MoXBots.git. Branch: `codex/model-recovery-001-20261019`.

## Delivery states

- Implementation and deterministic fault injection: complete; final merged-source checks and CI pending below.
- Controlled actual SDK/native process: complete. This is synthetic loopback Provider acceptance, not a paid Provider or signed desktop installation.
- UI: production MessageList and GoalStatusBar in an isolated synthetic fixture passed independent IAB visual review. Dark/light layout, live countdown, pause/success transitions and original Goal Pause/Cancel callback paths verified; callback counts each 1. Screenshots `waiting.png` and `goal-paused.png` in the evidence directory. Native desktop acceptance remains separate.
- Remote main integration: pending. A task branch or PR is not main delivery.
- Desktop release: send to existing sole publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4` for next unfrozen batch after CI/main acceptance. No daily app replacement/restart or competing release.
- Signed native/real Provider/production business acceptance: remains a release-owner gate; not claimed by local tests.

## Behavior and limits

See `specs/tech_docs/model_recovery.md`. Ordinary builtin API Sessions and Goal turns share original Query ownership. Short retries/authorized backup precede durable 15s..5min waits in an absolute 30-minute window. Native SDK independent transport/retry timers cannot preempt that owner. Cold restoration uses the same native identity, route and action ledger. Stop/Goal pause revoke the local epoch before disk and send the exact original interrupt; a synced immutable Stop fence survives index publication failure. Missing/corrupt/uncertain history fails closed. Goal keeps its original Rust scheduler and deadline.

The action ledger blocks confirmed tool-name/canonical-input repeats, including a changed native tool ID. It does not prove semantic or distributed exactly-once writes with different arguments; those still need business idempotency/read-only reconciliation. External, subscription, managed and integrated runtimes retain their own inference owner. Application sleep/exit does not execute model calls; ordinary intents resume on original Session restoration and Goal restoration stays with its original owner.

## Evidence

All local commands use Node 24 and isolated scratch storage; no real Provider credentials or paid calls. Raw logs and screenshots are outside Git: `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/work/model-recovery-001-20261019/`.

| Check | Result / boundary |
| --- | --- |
| Focused bridge, action ledger, policy and SessionStore fault tests | 198 passed in the earlier combined run; final source rerun recorded below |
| Existing builtin execution and real SessionStore integration | 108 passed before final Stop-CAS cases; final combined run recorded below |
| Added cancelable admission / missing native history | 2 passed; Stop while resume CAS is held never starts Query |
| Production MessageList / TabProvider / GoalStatusBar DOM | 132 passed; original lifecycle/callbacks retained |
| Native SDK 0.3.296 | final transport settings: counter=1, changed-ID duplicate denied=2, restored admit=1; same native Session `488be10f-8c13-47d1-86a4-f3482d48d373` |
| Native receipt | `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/moxbots-model-recovery-native-amZ8EU/receipt.json`; script `scripts/verify-model-recovery-loopback.ts` |
| Deadline timing boundary | persisted 15s and original deadline survive reconstruction; fixture clock compresses permitted wait, no 35-minute real-time soak claimed |
| Build/type/lint | initial typecheck, server/web builds, focused ESLint passed; dependency check 0 errors / 18 existing warnings; final source checks below |

## Independent review and execution record

Primary Agent owns integration, stop persistence, restore admission, final acceptance and main delivery. Three bounded workers shared mutually exclusive files with explicit interfaces; no nested workers or external models.

| Worker | Requested model / effort | Scope / outcome |
| --- | --- | --- |
| goal_recovery_audit | gpt-6-luna / medium | read-only Goal owner/watchdog audit, then exclusive durable recovery module; 26 tests |
| bridge_recovery | gpt-6.1-sol / high | inference lease/partial stream/terminal evidence, 136 tests and actual native SDK counter acceptance |
| recovery_ui | gpt-6-luna / medium | existing UI events/status/locales, independent control review, production-component fixture |

Selection basis: cross-layer control stays with one integration owner, while the policy, bridge and UI packages can be reviewed independently. Escalation reason: bridge partial-output/lease races justify higher capability from the start. External-model reason: live cross-process state and safe lifecycle handoff costs favor native bounded workers. Actual executing model identity, token usage and monetary costs were not exposed; no unsupported cost savings are claimed.

Review findings repaired: persistence failure must not report durable Stop; time spent writing/sleeping must not extend deadlines; SSE terminal delivery must precede cleanup; late same-ID old Query must not pause a rebound successor; explicit resume CAS must remain cancelable; a Stop fence must survive index-write failure; native SDK timers must not create a competing retry owner. Actual browser review also corrected fixture entry/runtime imports and layout before acceptance.

## Final-source verification, CI, main and release receipt

Merged `4dcb3d7c34fc315a810fd30cdc9b036569805c2b` (PR150) into the task branch, preserving error-resend and Task history changes. Local combined source checks: 361 unit/integration tests across 13 files passed (`merged-focused.log`, 208.87s); 133 production-component DOM tests passed (`merged-dom-fixed.log`, 32.68s); full TypeScript check and server bundle passed. Targeted ESLint passed (only existing baseline-browser-mapping age advisory); classification: 414 server tests, 116 integration, 6 credentialed. The DOM assertion originally read two different real-time timestamps and failed by 2ms; it now captures one timestamp and retains the same state assertion.

Concurrent main then advanced to PR143 (`a766d1a2ad300cf1acc5e45fd3105c378cdebfe0`). Its updater Stop/terminal acknowledgement changes were reviewed and merged without conflict. The updater now explicitly requires durable model Stop acknowledgement before restart eligibility; original terminal acknowledgement is preserved. Final control union: 126 tests across five files passed (`final-control-union.log`, 37.62s), including all 29 original interrupt facade cases and 30 durable policy cases. Additional builtin transport/update-ack true/false cases both passed (`update-durable-ack.log`, 31.39s). Full TypeScript check passed after this main combination.

Two final control findings were repaired: concurrent pause/abort calls share one in-flight Stop Promise; a constructor snapshots an existing waiting intent so Stop before the first HTTP admit still persists, while stale constructors cannot pause a successor. Corrupted deadlines exceeding 30 minutes are rejected. CI now runs the actual native model-recovery loopback script as a mandatory JS step. Exact CI, merge and publisher receipts are linked from the delivery PR and the external evidence directory; source/CI/main acceptance is distinct from signed desktop and production acceptance.

Final independent bridge reviewer found and blocked a pre-merge admission/Stop race in `70d69c08`: admission rebind keeps its wait attempt, while an extra pause guard assumed every pending checkpoint increments it. Removing that redundant restriction retains exact expected-checkpoint CAS and lets Stop durably pause a held restore-prepare. Both same-turn and rebound-turn regression cases pass; durable policy unit suite is now 32/32. The earlier CI head is superseded and cannot authorize final merge. Final PR checks must match the replacement head.
