# MOXBOTS-BACKEND-RECOVERY-20261017 — DSH

Scope: native child approval guidance, reproducible Runtime source patch/build, and isolated native approve/deny acceptance. Root owns integration/mainline, relay and release. This worker does not change installed Apps, publish artifacts, push upstream or modify sealed Runtime/cache bytes.

## Acceptance checklist

- [x] Verify source owner, immutable selected artifact, public seam and baseline failure.
- [x] Prepare source fix at the Runtime composition owner without changing authorization.
- [x] Save a pinned source patch and independently reproduce the exact clean source commit.
- [x] Add native child deny/non-execution coverage while retaining both small/large prompt assertions.
- [ ] Rebuild accepted baseline dependencies and a new Runtime with the official builder.
- [ ] Admit the new handoff and pass complete native tests against those exact bytes.
- [ ] Root independent review/retest and formal artifact delivery decision.
- [ ] Mainline/remote delivery and production acceptance (root-owned).

## Owner and fix

The selected upstream Release is `hAcKlyc/MyAgents-dsh` 0.1.18, source `8f5a36fa3ef7544b5dfeda432f0446531d476707`, protocol 6.2.0. GitHub currently grants read but no push permission to that repository. No local source checkout existed; a dedicated scratch clone was created at `/Users/zhangshaohua/Documents/Codex/2026-10-17/moxbots-dsh-source`.

`@deepseek-ai/dsh-subagent` registers a child-local `subagent:delegation` context claiming all approval-required operations are rejected. Runtime composition separately applies the parent's effective Host approval policy. The native sequence actually accepts approvals and rejects a deliberate denial; the advisory paragraph contradicts that behavior. Host `systemContext` cannot replace that child-local contribution.

DSH exposes the public `system-prompt/assemble` waterfall. The Runtime composition now projects only the named `subagent:delegation` contribution from the public child policy override and configured default of `ApprovalService`: `ask` describes Host answerers/fail-closed behavior; `never` retains automatic rejection. Root prompts, arbitrary Host contexts and the permission policy/events are unchanged. No dependency package or security decision is patched.

Pinned recipe: `scripts/integrated-runtimes/source-patches/moxbots-child-approval-context.json`; source patch SHA-256 `0f0bed508efc781598560cd2e21dc25d73b4977956958c5e12f2015c679bf97e`; resulting source commit `32a10c530f6dfbb1cb8722a5569cdcaec4c67cbd`. The recipe fixes the parent, patch digest, author/date/message and changed paths, then requires an exact clean result commit. Its accepted DSH dependency manifest is `8a55db844fcfed62e2320d4c0873934c72ea56e4826d359c5af928f388dce6ed`, matching the actual 0.1.18 Runtime; the Host source-mode snapshot's older `1ee891…` does not govern this artifact.

## Reproduction

Use exact Node 24.20.0 and npm 11.19.0, with network access for pinned source/dependency preparation:

```sh
node scripts/integrated-runtimes/build-moxbots-dsh-runtime.mjs \
  --out /absolute/new-build-directory --full-checks --validate-native
```

The builder creates a dedicated upstream source checkout, checks/applies the pinned source patch, verifies the deterministic source commit, runs upstream setup and focused tests, optionally executes full source gates, then invokes the existing official native handoff builder. `--validate-native` uses its deterministic installed Runtime campaign and returns a verified native-target claim; without it the local handoff retains `implementation-complete_pending-native-validation`. Neither mode creates a tag or publishes a Release. `--source /absolute/existing-git-checkout` can supply the same pinned source objects read-only; `--source-only` reproduces the source receipt without dependency setup.

Two final independent source-only reconstructions passed at the same clean result commit and patch digest (`dsh-source-repro-external-final.log`, `dsh-source-repro-external-second.log`). The resulting source is `32a10c530f6dfbb1cb8722a5569cdcaec4c67cbd`; earlier context-only reconstructions are historical evidence. Logs are under `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/backend-recovery-20261017/`.

## Evidence to date

| Layer | Result | Evidence |
| --- | --- | --- |
| Old selected Runtime, original native approval cases | Both fail only at retained contradictory-prompt assertion | `dsh-native-baseline-approval.log` |
| Old selected Runtime, added child deny | Both small/large cases pass approved execution, child lineage, inherited exact grant and denied non-execution, then fail at the same prompt assertion | `dsh-native-baseline-approve-deny.log` |
| Source helper and exact external installation regressions | 5 passed including accepted authority nested overrides; context case covers: actual ask/never transitions, root/literal context isolation, unchanged policy and disposal | `dsh-source-external-graph-unit.log` |
| Final source reconstruction | Exact clean `32a10c530f6dfbb1cb8722a5569cdcaec4c67cbd` | `dsh-source-repro-external-final.log` |
| Initial source compile before verified setup | Not accepted: ordinary registry DSH lacks the required patched exports | `dsh-source-initial-typecheck.log` |
| Resource selection, exact tar integrity, native claims and provenance regressions | 21 passed; wrong publisher/source/recipe, pending platform, corruption and missing-release fallback all rejected | `dsh-resource-full-tests.log` |
| Scoped Host/build lint and workflow syntax | Passed; four native targets, narrow PR paths, manual dispatch, contents read-only, no publish job | `dsh-scoped-eslint.log` and local js-yaml parsing |
| Official source setup | Exact DSH commit/tree and Pi source fully acquired. Historical store has 1391/1392 packages; SheetJS CDN input successfully warmed with the original URL and pinned SRI using pnpm_config_fetch_timeout=180000; full official setup resumed. No accepted artifact or native success claimed yet | `dsh-source-setup-warmed.log`, `dsh-xlsx-official-prime.log`, `dsh-baseline-checkout-resumed.log` |
| Windows native candidate launcher | Initial CRLF digest failure fixed by narrow LF attributes; next direct-Node npm lifecycle-context failure fixed by selected toolchain JS entrypoint resolution. Full 22 resource/builder/package tests pass; actual next candidate native run remains pending | `dsh-ci-win32-39033363178.log`, `dsh-resource-full-tests-after-windows.log`; checkpoint `364ad49e` |

The native fixture uses isolated HOME/workspace, actual DSH child processes and loopback synthetic Provider/HTTP servers. It proves Runtime/Host behavior without real model calls or user files. It does not prove signed desktop installation, UI cards or production acceptance. Formal four-platform publication/selection remains a separate root-owned decision; a local source patch or handoff is not a published client resource.


## Owned candidate gate

The new `dsh-owned-candidate.yml` runs on narrow source/build paths in a PR or explicit dispatch. Each actual native runner uses exact Node/npm, full source gates, source reconstruction and the official deterministic native campaign/handoff/archive roundtrip. The aggregate manifest requires all four verified targets and identical recipe/source provenance, and checks every archive size/SHA. Jobs only upload Actions candidates with read-only repository permission.

The candidate selector remains separate from `src/shared/integrated-runtimes/dsh-release.json`. Root must approve/publish the verified fixed tag `dsh-v0.1.18-moxbots.1` in `heavenzhang/MoXBots` before activating it. Formal resource preparation has no automatic upstream fallback. Packaging requires the recipe, source diff, builders and workflow to be committed at the declared MoXBots provenance commit; this worker leaves that checkpoint to root.

The source patch also repairs the upstream repository-check installer: it projects exact external root pins and recursive parent/version overrides from the already verified consumer, retains local DSH tarball overrides, runs npm ls and Cordis/group/Zod identity checks, and restores original package/lock bytes in finally. This preserves accepted dependency artifact 8a55; it does not patch the native dependency builder authority. A host npm registry mirror caused a separate local cache-metadata mismatch; only owned build subprocesses now explicitly warm the lock authority registry npmjs, without changing global npm configuration.
