# MB-INTENT-TRANSPORT-20261107 — native follow-up

Goal: complete the original send-failure repair with a usable native entry flow.
Branch: `codex/initial-send-ready-20261107`; base: `0146039c9fe6c4229d8e34459d711b5951a606a4`.
Scope: Chat first-message admission readiness only; no backend retry or ledger edits.
Desktop/main/CI/release owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4` (existing owner).

- [x] Original classifier repair included in installed 543.4; real reply and file write/read completed.
- [x] Native New conversation → Send and start failure reproduced before submission.
- [x] Add restore-readiness gate and observe readiness transition before consuming launch.
- [x] RED/green tests: 163 related checks pass; restore failure still blocks, successful restore sends once.
- [ ] Owner review and remote-main integration (existing PR 259 batch).
- [ ] New immutable candidate build/install by owner.
- [ ] Native first-message-from-dialog → answer → idle on new candidate.
- [ ] Owner formal promotion after required CI and acceptance.

Evidence: `dev-docs/intent-transport-20261107/acceptance.md`; private `work/MB-INTENT-TRANSPORT-20261107/result.json`.
Dependency: original dd972c3 and desktop integration 0146039c; no other deployment units.
Next: hand off exact source SHA after type/lint checks, retain 543.4 receipts and do not overwrite its artifact.
