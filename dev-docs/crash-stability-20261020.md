# MOXBOTS-CRASH-20261020 — desktop exit and watcher resource investigation

## Scope and current result

The user reported frequent desktop exits. Three locally observed main-process exits at 2026-10-19 23:59:16, 2026-10-20 00:05:20 and 00:06:12 (Asia/Shanghai) have launchd termination tuples `(0, 0, 0)`. They overlap the existing publisher's 0.5.14 installation. This is evidence of successful process termination, not proof of who requested it or proof that every reported exit was an installation operation. No corresponding recent main-process IPS or Rust panic was found. The installed 0.5.14 process remained alive during diagnosis, and public read-only Session state plus native window inspection succeeded.

A separate resource defect was verified in the live 0.5.14 process: approximately 500 MB RSS shortly after launch rose above 2 GB within three minutes, with sustained CPU activity. Native sample stacks show `Debouncer::watch → FileIdMap::add_path → WalkDir` and FSEvents cache updates. `notify-debouncer-full 0.6.0` uses FileIdMap on macOS/Windows; it recursively caches descendant file IDs and follows symlink targets. This duplicates a potentially enormous workspace tree before watch registration returns. Long transcript search replay also consumes CPU; this patch does not claim to resolve that separate cost or prove an OOM termination.

## Change

Workspace watchers explicitly use NoCache. Their existing contract is coarse invalidation followed by an authoritative directory re-read, so pairing external rename identities is unnecessary. Exact application-owned moves continue through `emit_committed_moves`. Watch tokens, reference counts, debounce interval, filesystem notifications and persistent user data retain their existing owners.

## Verification

- [x] Extracted the exact production constructor and its new regression from the changed source and compiled them against locally cached actual notify-debouncer-full 0.6.0 / tempfile dependencies with pinned Rust 1.92.0. Actual macOS nested create, external rename, atomic replacement and delete pass (0.47 s).
- [x] Controlled fixture comparison: 20,000 workspace files plus a symlink to 20,000 external files. Default FileIdMap registration: 398.713 ms, maximum RSS 27,492,352 bytes, peak footprint 22,249,904 bytes. NoCache: 1.757 ms, maximum RSS 7,487,488 bytes, peak footprint 2,212,248 bytes. These are separate-process synthetic measurements, not installed-client savings. Fixture now lives outside the WPS workspace.
- [x] Whole-crate native macOS watcher tests: 6 passed, 0 failed. Xcode compatibility archives were exposed with LIBRARY_PATH and the existing CI runner policy uses DYLD_FALLBACK_LIBRARY_PATH=/usr/lib/swift. The initial link/loader failures are retained; no product linking configuration changed. Added this focused suite to the existing macOS CI job; Linux broad Rust and Windows workspace IO already execute it.
- [ ] Exact-head CI, main integration and remote ancestry verification.
- [ ] Signed desktop publication and large real-workspace acceptance. Only the existing desktop publisher owns this step; do not replace or restart a running client from this task.

Machine-local raw evidence: WPS MoxBot `work/crash-20261020/evidence/` (native sample, window receipt, system termination lines, read-only state receipts, compiler/test output and resource measurements). No private session content or credentials are committed.

## Delivery boundary

The current installed 0.5.14 binary does not contain this change. Source acceptance is separate from a signed package, safe installation and real-user resource acceptance. Keep the user's ongoing tasks intact. Next step: finish focused validation, deliver to main, then submit an exact-source release intake to the existing desktop publisher.
