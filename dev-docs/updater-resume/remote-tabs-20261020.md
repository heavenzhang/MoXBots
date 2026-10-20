# UPDATE-20261020-01: remote-tab update admission

## Problem and result

`assertUpdateTabsSafe` previously threw for every `remote-session` tab. The user reproduced the permanent block on another computer running 0.5.13 while the online updater advertised 0.5.14. Waiting could never change this predicate.

The desktop checkpoint now reads the existing remote draft Map and operation ledger. Empty remote tabs are admissible regardless of the remote execution state. Unsent text and unconfirmed/unknown operations still block with an actionable explanation; deferred tabs use these same owners. Mounted remote editors and question forms join the existing composer admission registry to protect IME and unsubmitted answers. Existing checkpoint freeze/final verification/release is reused, and remote mutation handlers check its lock before writing the operation ledger or calling the remote owner.

This does not stop remote work, auto-send drafts/answers, add a persistence owner, bypass native signature/local activity checks, or change an already installed old client's code. Remote text/answers are not yet durable across restart: the user must handle them when prompted. A 0.5.13 bootstrap requires retaining unsent content/checking receipts, closing local remote tabs, then using ordinary restart/update. Closing the observation tab does not delete or stop the remote session.

## Validation

On task branch `codex/update-remote-admission-20261020` at base `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`, using the existing dependency installation and bundled Node24:

- `vitest run --project unit --project dom src/renderer/utils/composerUpdateCheckpoint.test.ts src/renderer/features/remote-session src/renderer/components/SimpleChatInput.checkpoint.test.tsx src/renderer/components/task-center/LocalTaskEditors.checkpoint.test.tsx src/renderer/components/task-center/ThoughtCard.checkpoint.test.tsx src/renderer/hooks/useUpdater.moxbot.test.tsx`: 10 files / 100 tests passed.
- `tsc --noEmit`: passed.
- Changed-file ESLint: passed. Preparation dependency-cruiser: zero errors, 18 existing no-orphan warnings.
- The real React remote component in isolated Chromium, 1440 and390 widths, passed DOM inert/readOnly, lock rejection of send/respond/Stop, release, unsent-text and unanswered-question preservation. Transport was synthetic; production theme/native updater/real remote Host were not connected. This is behavioral evidence only, not production visual or responsive acceptance.
- Patch application was checked on the immutable original base before migration to this task worktree. Raw evidence lives in the existing private workspace `MoxBot/work/UPDATE-20261020-01/evidence/`; `git-regression.log`, `git-typecheck.log`, `git-lint.log` are this worktree's repeat checks, while `browser-result.json` and `regression-final.log` belong to the prior exact-code preparation. No credentials, user transcript or binary artifact is committed.

## Integration and release gates

User explicitly confirmed the repository and notification to the existing sole desktop updater publisher. That owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4` and coordinates shared CI, normal mainline integration, candidate version, immutable source/tag/artifact, distribution and rollback. This developer pushes source/local evidence only and does not run a parallel release or manipulate the daily client.

PR172 currently carries a shared `TextChatComposer` conversion of `RemoteSession.tsx`. Combined integration must retain that composer and its IME sizing, apply this checkpoint admission to the resulting control, and rerun remote/UI/checkpoint tests. A published/frozen0.5.14 or515.2 artifact is immutable; this task cannot silently enter either. The publisher selects the next unfrozen batch after checking exact code and dependencies.

Mainline containment, signed package, online promotion and actual another-computer upgrade are separate open gates. Required native checks: keep an empty remote tab while remote work runs; update/restart without remote Stop or duplicate send; reopen the same remote Session; verify input/request preservation and release after a rejected install. No physical other-computer acceptance has been observed in this task.
