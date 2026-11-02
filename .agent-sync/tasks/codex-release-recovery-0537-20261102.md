# Task: MB-RECOVERY-INCIDENT-20261101-PHASE18-5371

## Objective
Integrate the reviewed Phase18 continuation and foreground command fix into the next immutable desktop version 0.5.37/build 537.1; preserve the installed application and original session ledgers.

## Acceptance and dependencies
- [x] Source 16fefc23826c01fe974213d8a11a6a08ad12da3a and parent 1626ca58c6d409f7ef73a0239a8b87ed1b1c1486 reviewed; original targeted tests and real SDK loopback evidence retained.
- [ ] Exact versioned source checks, remote source CI, normal main merge and remote tree proof.
- [ ] New signed notarized immutable artifact, no overwrite of previous packages or tags.
- [ ] User-ready maintenance window, original-session safety review, install and real acceptance.
- [ ] Publication and corresponding normal TLS checks; original 502 recovery is not complete until original session acceptance.

## Ownership and scope
Desktop/macOS ARM64/updater/shared CI/main: 01a12bc2-907a-7702-b6dd-788225c5dfe4. Website remains its existing owner. This batch contains Phase18 and version changes only. User is actively using the daily application, so installation and native acceptance remain deferred.

## Status and next step
Integration worktree begins at exact source commit 16fefc238. Host task-init declined because existing adopted source is ahead of base; adopt declined because vendored skill differs. Both failures are preserved in batch evidence; no reset, vendored skill replacement, or false pass. Prepare version delta, validate and sync using appropriate reviewed project workflow.
