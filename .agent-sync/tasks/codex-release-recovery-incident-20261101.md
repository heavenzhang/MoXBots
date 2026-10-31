# MB-RECOVERY-INCIDENT-20261101 — combined source integration

## Scope and owner

Desktop/macOS-arm64/updater/shared CI/main owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4. Integrates recovery source 44fd167a171e50ca71fd4995a3b843bbe284983d and task panel source bd36aaf7a6bc96a7ba2fdc8e05000a1d03d40e9a; base e11ee39b5629d6e74810b75e2155a45400d45005. This is source integration only, not a released artifact.

## To Do

- [x] Preserve both source histories and resolve shared plan conflict retaining both records.
- [x] Run combined 54 DOM, 68 recovery unit, recovery integration, TypeScript and scoped lint.
- [ ] Push exact candidate; run automatic CI, then verify fresh main and merge if required checks actually pass.
- [ ] Review later source for intent, proxy and Responses idle classification; fix or explicitly preserve unresolved cases.
- [ ] With user available, verify original sessions and affected native UI, then issue one new immutable version and publish.

## Boundaries

0.5.28/528.1 installed locally but held from stable channel due actual original-session failures. 0.5.27 remains stable. Never clear uncertain actions or replay business commands. Source owner continues separate diagnostics. No native UI access while user is using the app. Vendored task-init rejected already-integrated clean HEAD as start_head_mismatch; installed adopt refused differing vendored skill. Both original outputs retained in work/release-recovery-incident-20261101/owner; this hand-maintained record does not claim either gate passed.
