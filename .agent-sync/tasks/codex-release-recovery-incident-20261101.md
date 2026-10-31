# MB-RECOVERY-INCIDENT-20261101 — combined source integration

## Scope and owner

Desktop/macOS-arm64/updater/shared CI/main owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4. Integrates recovery source 44fd167a171e50ca71fd4995a3b843bbe284983d and task panel source bd36aaf7a6bc96a7ba2fdc8e05000a1d03d40e9a; base e11ee39b5629d6e74810b75e2155a45400d45005. This is source integration only, not a released artifact.

## To Do

- [x] Preserve both source histories and resolve shared plan conflict retaining both records.
- [x] Run combined 54 DOM, 68 recovery unit, recovery integration, TypeScript and scoped lint.
- [x] Push initial candidate 816676c60062bdf09b29546339a164a6f58d8fb2 as PR 217; automatic CI 41219907813 remains in progress.
- [x] Integrate source increment 7b7d0db38d3e9fbdc0b22ea845fc9b16c600e7d7; combined focused tests: 16 unit, 94 integration, 17 DOM. Intent failures still block writes and diagnostics do not establish real-session recovery.
- [x] Integrate d544baacc5e9ce13acad4f0f558eca95bcbc1851 to remove the fixed task-wide 30-minute deadline as the user requested, retaining stop, ownership, unknown side-effect, no-progress, rework and per-request network protections. The old deadline field remains for rollback compatibility; an older binary will enforce its old policy.
- [ ] After all initial CI jobs terminate, push the updated candidate once and require its own exact-head CI before fresh main and merge.
- [ ] Investigate remaining intent and proxy failures through actual evidence; preserve unresolved cases.
- [ ] With user available, verify original sessions and affected native UI, then issue one new immutable version and publish.

## Boundaries

0.5.28/528.1 installed locally but held from stable channel due actual original-session failures. 0.5.27 remains stable. Never clear uncertain actions or replay business commands. Source owner continues separate diagnostics. User has authorized the original owner to resume native installation and acceptance; first check fresh activity and protect ongoing work. Vendored task-init rejected already-integrated clean HEAD as start_head_mismatch; installed adopt refused differing vendored skill. Both original outputs retained in work/release-recovery-incident-20261101/owner; this hand-maintained record does not claim either gate passed.
