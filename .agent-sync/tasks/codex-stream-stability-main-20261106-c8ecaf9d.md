<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/stream-stability-main-20261106 -->
<!-- git-project-sync-task:base=ce11d2a332c8e276478048fdf3cf935b5dabaad6 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-STREAM-STABILITY-20261106 Root main integration

## Objective

Deliver producer 869c415fd1aaf0f097a6d9e9117c640b9e4da123 to actual remote main through the existing sole desktop/sharedCI/main owner. Keep installed and published 0.5.42/build542.6 immutable. This source/main task does not itself install a new package or replay any original business operation.

## Acceptance criteria

- [x] Verify exact producer and latest main, review production/test delta and preserve producer ancestry.
- [x] Isolate integration from latest ce11d2a332c8e276478048fdf3cf935b5dabaad6; no conflicts or unrelated sources selected.
- [x] Root targeted regression, geometry, type and lint checks pass.
- [ ] Exact selected PR checks satisfy applicable gates; original failures are retained.
- [ ] Fresh pre-mutation admission, normal merge and remote ancestry/tree readback complete.

## Completed

- Existing website source PR255 has been normally merged and remote verified first; this isolated integration includes its static metadata.
- The only product delta is Message.tsx: message-owned isLoading maintains process eligibility during completed-block gaps; BlockGroup and ProcessRow retain actual per-row outcomes and terminal folding.
- Original source branch/task record remains unchanged. Root branch record uses the repository's vendored v1 protocol; producer's v2 record remains historical provenance.
- No backend, journal, permission, model, version or published artifact changes selected.

## Verification

- Root reviewed exact Message delta, adjacent MessageList isStreamingMsg ownership, BlockGroup compact predicate, both new DOM tests and offline geometry harness.
- Producer reports 71 DOM and WebKit/Chromium geometry checks; these remain producer evidence until Root execution below.
- Root independently passed6 DOM files/71 tests, tsc, scoped ESLint, test classification, whitespace and WebKit real MessageList/Virtuoso geometry: three inter-block gaps retain height/scroll, manual250px reading remains stable, terminal collapses and manually expands28 rows. Main CI and installed-native acceptance are not yet claimed.

## Blockers and unknowns

- The installed542.6 runtime does not include this new source fix. Actual original-session native verification belongs to the next separately selected immutable desktop batch.
- Original business unknown/recovery state is protected; the original recovery owner coordinates its continuation. This UI integration does not replay or settle it.
- Hosted ARM capacity is reported separately from product failures; only the documented precise local alternative may supplement a zero-step capacity cancellation.

## Next step

- Run Root affected checks, commit/push this exact integrated source once and open one PR for automatic CI; merge only after source/checks and fresh main admission pass.
