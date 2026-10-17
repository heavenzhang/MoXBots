# MOXBOTS-BACKEND-RECOVERY-20261017 — DSH

Scope: correct native child approval guidance at Runtime composition, preserve accepted dependencies, reproducibly build and validate candidate Runtime resources. Root owns integration, mainline, artifact publication/selection and independent MoX Host acceptance. This worker does not change installed Apps, push upstream or rewrite immutable artifacts/cache bytes.

## Checklist

- [x] Locate the source owner and reproduce both original native approval failures.
- [x] Fix only the named child delegation context using the effective public Host approval policy.
- [x] Rebuild the accepted 105-package dependency artifact with its official builder, unchanged manifest and byte-identical native archives.
- [x] Preserve repository and accepted consumer lock authorities separately; verify real installation, identity and transactional rollback.
- [x] Pass complete source typecheck, lint, unit tests and build with exact Node/npm.
- [x] Save the new fixed source recipe and candidate metadata; root independently reproduces the clean source and resource tests before committing.
- [x] Retain both small/large prompt negative assertions and add explicit child deny/non-execution coverage.
- [ ] Complete official installed Runtime/native campaign and verified handoff for the new exact source.
- [ ] Complete four native platform candidate jobs, archive roundtrips and aggregate manifest.
- [ ] Root independently admits exact candidate bytes and runs complete MoX Host native integration suite.
- [ ] Root formal publication/selector decision, mainline/remote delivery and applicable production acceptance.

## Source owner and fix

Selected upstream `hAcKlyc/MyAgents-dsh` 0.1.18 is source `8f5a36fa3ef7544b5dfeda432f0446531d476707`, protocol 6.2.0. Upstream is public/read-only for this task. `dsh-subagent` contributes child-local `subagent:delegation` text claiming approval-required operations are automatically rejected; Runtime composition actually applies parent Host policy. The old Runtime's real Host sequence approves requests and rejects the explicit denial, then fails only the retained contradictory-text assertion. Host wire systemContext cannot replace that child-local contribution.

The fix uses the public `system-prompt/assemble` waterfall at Runtime composition. Only the named child contribution is projected from `ApprovalService.overrideOf(session)` and its configured default: `ask` describes configured Host answerers and fail-closed/denial behavior; `never` preserves automatic rejection. Root prompts, arbitrary context, policy decisions/events, child lineage and native dependency packages are unchanged.

Fixed recipe: `scripts/integrated-runtimes/source-patches/moxbots-child-approval-context.json`.

| Identity | SHA |
| --- | --- |
| Result source commit | `9f98b2818ee82c2e32d392f0b1735032059417f5` |
| Source diff SHA-256 | `e2b202b390f36e0faaceb1a56a3c6823f572ff7e0c19256232c456d8d79bf00f` |
| Recipe SHA-256 | `c63470f24635398064f423ca2156656c1a2884872c1cc3991b2769dff57c641b` |
| Accepted DSH artifact manifest | `8a55db844fcfed62e2320d4c0873934c72ea56e4826d359c5af928f388dce6ed` |

The recipe fixes upstream parent, diff bytes, author/date/message and exactly 15 changed paths, then requires the exact clean result commit. It includes the child context fix, isolated check installation, portable archive audit and regressions. The new clean checkout is `/Users/zhangshaohua/Documents/Codex/2026-10-17/moxbots-dsh-source-isolated`. Three unrelated Web UI edits in the original scratch checkout are preserved and excluded. No unknown UI changes enter the recipe.

## Two dependency authorities

The accepted artifact has been rebuilt successfully with the official fixed DSH source/patch plan. Its manifest remains `8a55…`; all 105 produced archives match the previously selected 0.1.18 Runtime vendor bytes. The source artifact builder authority, original consumer package/lock and sealed archives are unchanged.

The previous candidate `32a10c…` used accepted external overrides globally. Real CI exposed an ownership error: it replaced ESLint's AJV 6 graph with AJV 8. A scoped override experiment then passed direct versions but failed a real two-native shared-child test: npm 11.19 ancestor merging selected traverse 1.1 instead of accepted 1.0. Global name@version guards were rejected because the original repository and accepted consumer genuinely require different child versions for the same SSO parent identity. Those failures remain evidence; no assertions were removed.

The final installer keeps the original repository `npm ci` graph and copies the unchanged accepted consumer/tarballs into a separate OS temporary directory. It runs offline `npm ci --ignore-scripts`, `npm ls --all`, official no-ancestor/contained dependency checks and exact manifest/lock byte comparisons. It projects only 105 native package directories plus the evidenced public Cordis/Zod entry points. Node's normal realpaths preserve native external dependencies, while development tools retain their own lock graph. No NODE_PATH, preserve-symlinks, force or legacy-peer-deps is used.

Projection preflights canonical parent directories and old lock/receipt identity, verifies all targets before mutation, backs up each existing entry, and commits an atomic receipt inside validation. Validation failures restore prior entries; cleanup failures preserve live consumers and traceable backups. The receipt tracks retained consumers through setup, full checks and the native builder's second installation. Public identity checks use literal public resolution and the already allowed `CommandRuntime` API: construction with public Cordis Context installs the native Typert invocation accessor. No private import or baseline exception is added.

The real regression entry is `node --import tsx scripts/verify-isolated-dsh-checks.ts`; MoX `--full-checks` invokes it before all existing complete source gates. Its private loopback registry proves two native parents retain AJV 8/traverse 1.0 and SSO@1/token@1.0 while dev retains AJV 6/draft04 and SSO@1/token@1.1. It also tests public Cordis/Zod instance identity, cross-boundary TypeScript compilation, workspace nested entries, receipt failure rollback, repeat-projection rollback, cleanup failure and unknown scope links. The default unit-test network/process prohibition remains intact.

Windows pack audit now supplies cwd plus a relative archive basename for both tar listing and extraction. It retains all content/path auditing and rejects unsafe operands; no platform-specific force-local flag is used.

## Reproduction and evidence

Use exact Node **24.20.0** and npm **11.19.0**. Homebrew's floating Node currently resolves a different patch and is not the build binary.

```sh
node scripts/integrated-runtimes/build-moxbots-dsh-runtime.mjs \
  --out /absolute/new-build-directory --full-checks --validate-native
```

This prepares the fixed source, runs official setup, focused/real-install/full source gates and official installed Runtime campaign/handoff. `--source /absolute/existing-git-checkout` supplies pinned Git objects read-only; `--source-only` reconstructs source without dependency setup. The official native builder consumes the accepted artifact unchanged. Optional live Provider work remains separate and no real model key is required for the deterministic campaign.

Logs are under `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/backend-recovery-20261017/`.

| Evidence layer | Actual result | Log |
| --- | --- | --- |
| Old Runtime approval/deny baseline | Both prompt-size cases pass real approved/denied execution and lineage, then fail the original contradictory prompt assertion | `dsh-native-baseline-approve-deny.log` |
| Accepted dependency rebuild | Official build succeeds, same manifest; 105 archives byte-identical to existing sealed vendor | `dsh-accepted-artifact-build-complete-cache.log`, `dsh-accepted-native-byte-reproduction.log` |
| Official npm metadata cache | All 200 required manifests readable offline | `dsh-official-metadata-offline-proof-final.log` |
| Actual accepted 105 isolated install and repeat projection | Both succeed; 107 native/public links, unchanged authorities and all 105 native public identities/accessor pass | `dsh-two-lock-105-install.log`, `dsh-two-lock-105-install-repeat.log` |
| Real two-lock npm regression | Passes Node v24.20.0/npm 11.19.0, conflicting child versions, identities, TS and all transaction assertions | `dsh-two-lock-real-npm-fixture-final.log` |
| Complete source typecheck | Passes all foundation checks and `tsc -b` | `dsh-two-lock-typecheck.log` |
| Complete source lint | Passes recorded diagnostic policy | `dsh-two-lock-lint-final.log` |
| Complete source unit tests | 78 files, 871 passed, 2 existing conditional skips | `dsh-two-lock-tests-recheck.log` |
| Focused context/policy/installer/Windows audit tests | 5 files, 68 passed | `dsh-two-lock-focused-tests.log` |
| Complete source build | Foundation, Reference Web and TypeScript pass | `dsh-two-lock-build.log` |
| First full unit run image failure | One existing pixel-image assertion failed; retained. Same case, original 41-test file and complete suite subsequently pass without a test change; exact first failure cause is unproven | `dsh-two-lock-tests.log`, `dsh-two-lock-image-failure.log`, `dsh-two-lock-image-full-retest.log` |
| Old four-platform candidate source32a | Fails real AJV lint on Unix; Windows also exposed absolute tar archive operand. Superseded, never published or selected | `dsh-ci-linux-source32a.log`, `dsh-job-117405288413-source32a.log` |
| New exact-source native campaign | Started, not yet claimed successful | `dsh-native-owned-9f98b281.log` |

## Delivery boundaries

The candidate workflow runs narrow PR paths or manual dispatch on four actual native runners, exact toolchains, full source checks, source reconstruction and official verified native campaigns. Each target archive is checked before/after tar roundtrip. The aggregate requires four distinct verified targets and identical source/recipe/provenance. Actions candidates are read-only uploads; there is no publish job.

Candidate metadata targets `heavenzhang/MoXBots` fixed tag `dsh-v0.1.18-moxbots.1`. Formal `src/shared/integrated-runtimes/dsh-release.json` still selects upstream 0.1.18. Root must accept/publish verified resources before activating the owned selector. Missing or invalid owned resources fail with no upstream fallback.

Native fixtures use isolated home/workspace and loopback synthetic Provider/HTTP endpoints. They prove real Runtime/Host processes and approved/denied effects without external model calls or user files. They do not establish signed daily-client installation, UI card acceptance or production release. Those states remain separate and root-owned.

Execution: this worker directly owns the DSH source/build changes; root and its independent reviewer perform separate integration/review. No worker delegation or external model call was made here. Actual model identifier, reasoning setting, per-worker token usage and monetary cost are not exposed to this worker and remain unknown.
