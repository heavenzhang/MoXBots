# Independent source review

Scope: combined source diff against main `670881d8cc1b4eed2aaa66df886cdfc83f70c14f`, with primary implementing shared/server logic and independent lanes implementing UI and regressions. This is source review, not CI, provider or production acceptance.

The independent reviewer identified two concrete P2 defects before submission:

1. A late native background writer or interactive request could arrive after the continuation ledger CAS and before commit. Fixed by reusing `humanContinuationLiveBlock` in the CAS, repeated-guard check and synchronous `validateAtCommit`. Three parameterized regressions cover blocking background work, waiting for user and pending interactive requests, including repeated guard evaluation without another turn increment.
2. A known undispatched cancellation left an unresumable `admission_cancelled` reason on the stable execution ID. Fixed only for an explicit continuation guard cancellation: normalize it to stopped, then require its real terminal receipt before a human can resume. Unknown or lost dispatch ACKs retain their unknown reason and remain blocked. A regression covers known cancel, preserved identity/budget/evidence and subsequent unknown ACK rejection.

The final server review reported both issues closed with no new concrete P1/P2 findings. It confirmed exact-queue stale callback/cancel fencing, previous-terminal proof, unchanged original deadline/counters/evidence and no second scheduler/store. It explicitly withheld UI acceptance until the final renderer lane completed its recovery-overrides-running change.

Primary UI acceptance requires the matching waiting/paused recovery to replace the running header status, with original execution terminal/unknown precedence. DOM and browser evidence for that change is maintained in `../session-execution-ui/acceptance.md`; original review of the older dual-badge UI is not counted as passing this condition.
