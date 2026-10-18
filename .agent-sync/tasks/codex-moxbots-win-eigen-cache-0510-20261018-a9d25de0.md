<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/moxbots-win-eigen-cache-0510-20261018 -->
<!-- git-project-sync-task:base=631bbd34c7f97f3e8bcf6d252e794443e37c521e -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-0510-WINDOWS-EIGEN-CACHE-20261018

## Objective

Make the pinned Windows 0.5.10 build tolerate the observed Node Fetch HTTP 406 from the frozen Eigen GitLab URL by preloading only the exact resource-lock bytes into the existing content-addressed cache. Preserve application source `v0.5.10` / `400b746a4841bab8e4b99d8f83479fd54925c205`, its resource lock, normal TLS validation, and all hash/size gates.

## Acceptance criteria

- [ ] Windows workflow reads Eigen metadata from the pinned source lock and asserts the expected URL, archive name, size, and SHA-256.
- [ ] Windows `curl.exe` fetch succeeds with normal TLS, and the received bytes match the pinned 2,967,272-byte / `e9c326dc8c05cd1e044c71f30f1b2e34a6161a3b6ecf445d56b53ff1669e3dec` resource.
- [ ] `prepare-native-inference` consumes the seeded cache and the full Windows 0.5.10 NSIS build, identity/provenance checks, and private one-day artifact upload pass.
- [ ] The merged builder commit is on remote `main`; the artifact is independently downloaded and its SHA/size match runner metadata. No GitHub Release is created.
- [ ] Website upload remains a separate least-privilege step. Do not reuse updater credentials or claim public download-page delivery without the authorized website identity.

## Completed

- Exact app source is pinned to `v0.5.10` / `400b746a4841bab8e4b99d8f83479fd54925c205`; current remote `main` base is `631bbd34c7f97f3e8bcf6d252e794443e37c521e`.
- The first Windows run `39086981403` failed in `Build MoXBots 0.5.10 NSIS installer` before NSIS, because Node Fetch received HTTP 406 while preparing the locked Eigen dependency.
- A full normal-TLS GET from the same official GitLab URL on the Mac returned the locked size and SHA-256. That exact file is validated by the repository's `validateLockedFile` and used only as a local content-addressed cache entry; the frozen source and lock were not changed.
- Added a narrow Windows workflow step to read and assert the frozen lock entry, download from the exact official URL with `curl.exe`, verify exact size/SHA, and seed the cache. It refuses changed lock metadata or invalid existing/downloaded bytes.

## Verification

- Failure evidence: <https://github.com/heavenzhang/MoXBots/actions/runs/39086981403> (step 11; Node Fetch HTTP 406).
- Mac full source GET: `/private/tmp/moxbots-eigen-5.0.1.tar.gz`; 2,967,272 bytes; SHA-256 `e9c326dc8c05cd1e044c71f30f1b2e34a6161a3b6ecf445d56b53ff1669e3dec`; normal TLS.
- Local cache gate: `scripts/document-processing-resource-cache.mjs::validateLockedFile` passed in exact frozen-source worktree.
- Branch diff and PR/CI/Windows build validation remain pending.

## Blockers and unknowns

- Windows runner `curl.exe` has not yet been exercised against GitLab; its pinned hash check will fail closed if the response is not identical.
- Public website still lacks a separate least-privilege upload identity; user confirmed no SSH Host alias. Authenticode remains unconfigured, so the page must disclose `NotSigned` if the Windows artifact is unsigned.

## Next step

Review the workflow/task diff, run local whitespace/workflow validation, then commit and open a normal PR from this branch. After required PR checks pass, merge normally and run the pinned Windows workflow from the merged mainline.
