# MB-REMOTE-SYNC-20261023: remote state projection repair

The real Air probe accepted one fresh text-only Session and returned its exact
test marker. `session get` can still read those two complete messages, while
`session state` returns `TARGET_PROJECTION_INVALID`. The human reported Air
0.5.18 initially and then an update to 0.5.19; the error reproduced after that
report. This does not establish the target's exact binary identity or close
the real two-device UI acceptance.

## Deterministic defect and change

`readSessionActivity` is the existing local activity owner and also returns
optional work progress and execution timing. Its inactive-history path derives
progress even for a pure text Session. The fixed AgentNet 1.2.0 `session.state`
outcome accepts a strict object containing only `sessionId` and `state`.
Passing the complete local object to `outcomeSchema.parse` rejects the additional
fields before any result can cross the encrypted channel.

The target now creates an explicit two-field wire projection. It still resolves
the authorized Agent/Session workspace before reading and still validates the
result through the original strict protocol schema. Local progress, execution
and persistence owners remain unchanged. There is no protocol archive update,
permissive schema, new endpoint, mutation or error suppression.

## Validation

- Before the change, all three new valid-state cases fail with
  `TARGET_PROJECTION_INVALID` / `unrecognized_keys` at `result`.
- After the change, target/source/session-observation unit suites pass:
  31 tests across 3 files. Valid states survive local progress/execution fields;
  workspace mismatch and invalid wire states still fail closed.
- Typecheck, affected ESLint, classification and fixed-protocol checks pass.
- Red/green and static-check logs stay in the original external task evidence
  directory under `state-projection-*.log`.

## Delivery and remaining acceptance

Source base is remote main `6c30c2f94f76589a9856c20bc368ec0ee5479678`.
The sole desktop CI/version/build/publication owner remains
`01a12bc2-907a-7702-b6dd-788225c5dfe4` (MoxBots桌面端统一打包负责人).
This repair belongs to its next unfrozen candidate. Published 519.2 and any
already frozen 520.1 artifact are not modified or relabeled by this change.

Main/shared CI, corrected artifact publication, actual device runtime identity,
the same Air Session's state read and real D1-D8 remain separate gates. The
development chat performed no additional start/send/Stop, GUI takeover,
installation, restart or release operation during this repair. The Air failure
is not declared resolved by the local regression result.
