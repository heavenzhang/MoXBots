# DSH source and candidate delivery independent review

Task: `MOXBOTS-BACKEND-RECOVERY-20261017`. Reviewed checkpoint: `116c8437cfdc663338873dcb01fc04c93ac138d4`. This review changed no Runtime, build, package, workflow or worker source. The reviewer did not repeat the Runtime build or native campaign.

## Conclusion

No additional actionable P1/P2 was found in the inspected approval-context patch, reproducible source/build flow, per-target package/collection flow, candidate workflow or formal resource parser. The known Windows `npm_execpath` launcher failure remains assigned to the DSH implementation owner and requires its repaired runner result. Four successful native target jobs, a complete verified candidate, resource publication, selector activation and exact-new-bytes Host acceptance remain separate gates.

## Approval boundary

The patch installs one public `system-prompt/assemble` contribution in the Runtime composition after ApprovalService initialization. It applies only to a Session with native `subagent` origin and a parent Session. It reads the effective child override and configured ApprovalService default on each assembly, then replaces only the reserved `subagent:delegation` context text. It does not call a grant, policy mutation, sandbox, execution or permission-response API. Parent prompts and arbitrary Host contexts are preserved; the registered contribution is disposed with the composition.

The source test covers ask/never changes, unchanged policy, parent/literal-context isolation and disposal. The Host native regression retains the contradictory-prompt assertion and adds a positive Host-answerer assertion. Its added denial checks an error tool result and exact proxy request equality containing only the approved root/child URLs, thereby excluding execution of the denied URL. Both small/large review variants remain present. The existing Host native test is skipped on Windows; a four-target generic Runtime campaign must not be described as proof that this particular Host native test ran on every platform.

## Source and artifact provenance

- The recipe fixes upstream base `8f5a36fa3ef7544b5dfeda432f0446531d476707`, patched source `d1d39a952f63af29eea3544e3dd52bd13eb8db1d`, author/committer metadata, changed paths and accepted native DSH dependency manifest identity.
- Independently recomputed patch SHA-256: `e464494f3db4cd7262763c4c225f94d68553f924397b8363af41f473a4fb1727`.
- Independently recomputed recipe SHA-256: `c009a322370772d56c0deaacd588954319b696d4f919260f852fa4f219636d47`.
- The source builder creates a fresh checkout, checks and applies that exact patch, requires the exact deterministic result commit and a clean worktree, and verifies the accepted dependency identity. Full builds require fixed Node/npm; a requested target must match the actual runner platform/architecture.
- Package admission requires the MoXBots recipe/build/workflow files to match their declared checkout commit, the Runtime checkout to match the clean pinned source, and the build receipt to declare full source gates plus native verification. The official packager verifies the complete handoff before and after archive roundtrip, checks the exact Runtime source commit and native addon, and requires exactly one verified native platform in each handoff.
- Collection requires all four distinct target receipts, identical source/provenance, verified claims, fixed publisher/tag/asset names, and exact archive size/SHA-256. A missing or pending target prevents a complete manifest.

## Candidate and formal selection

The workflow uses four actual native runner configurations, exact Node/npm, full source gates and the official installed-process campaign. It reconstructs source in a second checkout before packaging. Its repository permission is read-only and it uploads candidates; it does not create a tag, Release or desktop App release.

The formal parser admits the fixed upstream publisher or the explicit owned publisher `heavenzhang/MoXBots`. An owned selection must pin tag, asset template, patched/upstream source and recipe/patch digests. Its manifest must contain exactly four verified targets and matching provenance. Acquisition validates complete archive bytes before extraction and compares the handoff/Runtime/compatibility identities to the selected target manifest. Missing or invalid resources do not trigger an upstream fallback. Local handoffs retain the complete structure/facts verification path.

At the reviewed checkpoint, the committed formal `dsh-release.json` still selects upstream `0.1.18`; the owned selection is a separate candidate file. Therefore source delivery alone does not activate the repaired Runtime in a packaged client.

## Independent validation

Executed against this checkout:

```sh
node --test scripts/integrated-runtimes/prepare-dsh-runtime.test.mjs scripts/integrated-runtimes/dsh-handoff-policy.test.mjs scripts/integrated-runtimes/package-moxbots-dsh-runtime.test.mjs
```

Result: **21 passed, 0 failed, 0 skipped**, 532 ms. These are focused resource/provenance/selection tests, including rejection of wrong publisher/source/recipe, pending target claims, archive corruption, and absent-release fallback. They are not four-platform native Runtime execution evidence.

The Windows CI log for the reviewed checkpoint records `npm_execpath is required to launch package tools on Windows` before native campaign output; that target cannot be marked verified from that run. No installed desktop, production or real-user approval-card acceptance was performed by this reviewer.

## Windows launcher repair increment

The subsequent implementation-owner increment was inspected without changing its source. `selectedNpmEntrypoint` retains an existing usable npm lifecycle entrypoint or finds the npm JavaScript entrypoint in the selected Node's Windows-adjacent/Unix-lib layouts. The builder explicitly passes that environment to official `childCli` calls and propagates it before importing the official native builder. Node remains pinned and the actual npm version must still equal 11.19.0; this repair does not replace native validation or relax any provenance/package gate.

The existing Windows log reports setup-node's npm as 11.19.0 before the failed direct invocation. The repair therefore addresses the observed missing lifecycle environment while retaining the selected toolchain's version gate.

Independently executed:

```sh
node --test scripts/integrated-runtimes/build-moxbots-dsh-runtime.test.mjs scripts/integrated-runtimes/package-moxbots-dsh-runtime.test.mjs
```

Result: **2 passed, 0 failed**, 47 ms. One packaging test overlaps the earlier 21-test run. Both platform layouts, an existing lifecycle environment, and missing-entrypoint rejection are exercised. Scoped `git diff --check` passed. No additional actionable P1/P2 was found in this increment. A repaired Windows Actions run and the four actual target campaign/package outputs remain required before a complete candidate can be accepted.

## Accepted consumer dependency drift follow-up

The later Linux log `dsh-linux-364ad.log` fails while resolving `myagents-dsh@0.1.18` in the repository's `install:verified-dsh-checks` step: Cordis is pinned to 4.0.4, but a fresh no-lock peer resolution chooses `cordis-plugin-group` 1.0.5 from the `~1.0.4` range, and that new package requires Cordis `~4.0.5`. This is distinct from the accepted isolated artifact consumer, whose external pins/overrides, offline install/ci, `npm ls`, package integrity authority, compiler resolution containment and resulting package/lock digests already bind the historical graph.

The safe repair belongs to the temporary checks-install projection and its process environment. It must consume the already verified consumer's exact external dependencies/overrides, retain the 105 absolute local DSH tarball overrides, and restore the original repository package/lock bytes. Upgrading Cordis, using force/legacy-peer resolution, rewriting the accepted consumer lock, or changing the artifact builder would change or bypass the accepted authority. `build-patched-dsh-artifact.ts` itself is listed in the builder-authority digest, so changing it is not a transparent preservation of accepted manifest `8a55db844fcfed62e2320d4c0873934c72ea56e4826d359c5af928f388dce6ed`.

An intermediate checks-install repair had a P1 build blocker: it accepted only string override values, while the historical graph contains real parent-scoped multiple-version overrides. Examples include AWS token providers 3.1127.0 at root / 3.1138.0 below credential-provider-sso, and gaxios using agent-base 7.1.4 plus https-proxy-agent 7.0.6 while root uses 9.0.0 / 9.1.0. Flattening these changes the graph; rejecting objects prevents installation. This was reported to the owner and corrected in the next scratch increment with recursive exact-leaf validation, deep copying, retained parent selectors and recursive TypeScript declarations.

The revised checks installer also runs `npm ls --all`, checks the installed Cordis/group/Zod versions against the verified consumer, and restores original package/lock bytes in `finally`. Its subprocess wrapper explicitly uses the same official npmjs registry identity as the isolated artifact consumer instead of warming only a user mirror's packument cache; it does not edit global npm configuration. Static reinspection found no new P1/P2 in that direction. The owner still must demonstrate the unchanged accepted manifest/consumer digests and actual checks install/compile success, then refresh the Runtime source, patch, recipe and candidate identities together. This reviewer did not repeat the artifact build or install.
