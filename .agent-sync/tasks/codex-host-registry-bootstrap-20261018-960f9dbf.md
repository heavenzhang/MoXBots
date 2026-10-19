<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-registry-bootstrap-20261018 -->
<!-- git-project-sync-task:base=798f3a9c55697d4cf31dd6d894678f3a0b5da89d -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-REGISTRY-BOOTSTRAP-20261018

## Objective

MOXBOTS-HOST-REGISTRY-BOOTSTRAP-20261018: product-owned fresh Linux Node Host registry initialization before any control/management/catalog service is exposed. Canonical Git URL https://github.com/heavenzhang/MoXBots.git; isolated branch base798f3a9c55697d4cf31dd6d894678f3a0b5da89d. Root owns review/integration/release/actual acceptance. This worker never changes harness/publication paths, frozen M dcf8d9a60976c160e2b2aca33313c668c071132c, existing immutable artifacts, production/101/daily app or model/execution authorization.

## Acceptance criteria

- [x] Verify canonical repo/main/clean isolated worktree and Git task gates.
- [x] Root confirms startup transaction and single pending→committed CAS design before product changes.
- [x] Initialize only proven fresh registry or matching pending transaction; preserve valid existing pair and fail closed on partial/corrupt/lost/foreign evidence.
- [x] Reuse original agent-config-intent plus both per-file lock domains; never create another registry, Agent, Provider or task.
- [x] Keep strict missing-file catalog reader and existing identity/configuration/receipt authorities.
- [x] Targeted regression: old fresh catalog failure→real empty catalog, malformed/partial/link/HostID/committed-loss/no-overwrite/failure recovery and existing catalog regression.
- [ ] Commit/push/handoff immutable SHA; no PR/merge by worker.
- [ ] Root actual fresh browser/renewal/reboot acceptance with new product source and new release, distinct from frozen M.

## Completed

Created isolated worktree from freshly fetched main798f3a9c; start/task-init gates pass. Read applicable CLAUDE/AGENTS, vendored git-project-sync skill, project map/plan, architecture, pit-of-success and relevant remote-management registry invariants. Root confirmed startup transaction and early-review refinements. The existing kernel host.lock check remains before the new initializer, and control/management/catalog exposure remains after it.

New `src/host/registry-bootstrap.ts` owns only this Node startup phase, using original admin-config composite/project/config locks. Before any new HostID is written, it validates original identity, single private marker, registry and prior local state evidence. Genuine fresh state permits only isolated home, host.lock and absent/empty default workspace; ordinary useradd skel files are explicitly allowed. Foreign/old workspace, backup/temp/other registry authority cannot be adopted as empty. Valid existing identity+pair without a marker is used byte-for-byte without creating a marker. Existing committed authority must retain identity and both valid registry files; missing/corrupt/linked/foreign evidence fails closed.

The same-lock startup transaction exclusively persists a pending marker containing fixed purpose/version, selected HostID and unique transaction UUID before publishing identity. It then publishes projects=[] and config={agents:[]} and atomically consumes pending into committed through expected-inode/bytes phase CAS. A restart with a valid pending may only recover that original HostID and exact initial bytes. Data publication writes and fsyncs a private transaction-role temp, atomically links without clobber, then unlinks only its own temp and fsyncs the directory. A pending-bound exact temp/final same-inode nlink2 pair is the sole hardlink recovery exception; arbitrary links remain rejected. Partial pending-owned temp prefixes can only append their known initial suffix; unknown temps/nonprefix data are preserved and rejected. The marker's single phase avoids leaving replayable pending authority after commit.

Directories are pinned before original writer locks are acquired, Linux writes use directory-fd paths, owner/mode/no-follow/link/bounds contracts are checked, and only root-owned sticky ancestors are exempted from the ancestor write-bit rule; final state/home remain UID-private0700. Mac test entry paths are canonicalized by their fixture owner, with bundles/control socket outside installer-owned state, matching actual installation layout. No reader fallback, registry seed fixture, second registry/identity owner, model/execution authorization, service or permission is introduced.

## Verification

Independently read actual run39130296587:9 runtime observations report config/projects missing through failure, real NETWORK_CATALOG_INVALID firstError remains fresh/same PID/original identity. Prior actual run39129322532 demonstrated catalog→error→stopped41ms apart. No new VM/production/model operation performed by this worker.

Node24.21.0 focused initializer38 tests pass, including actual original empty catalog production, old-pair/no-overwrite, partial/corrupt/link/HostID/committed-loss refusals, same-selected-identity pending recovery, all four temp/final link windows, four prefix-temp recovery roles, unknown/foreign tmp and prior workspace rejection, original writer-lock contention and root-sticky ancestor/private-leaf contracts. Existing catalog7, Host management IPC11 and Host controller5 pass (61 total). The controller fixture now keeps bundle/control outside private state, creates installer-owned home and uses a canonical fixture root; its relocated-path regression passed after correction. Full TypeScript noEmit and changed-file ESLint pass; diff checks pass. These are local macOS synthetic/IPC tests, not Linux systemd/browser/renewal/reboot evidence.

## Blockers and unknowns

Source integration owner reviews this immutable candidate; root independently accepts new artifacts under trusted TLS before main/release coordination. Frozen M remains failed at catalog and is never relabeled passed by registry fixture creation. This source requires a new product revision/release and real fresh/repeat/renewal/KVM gates. If the first pending marker was not published before a crash, any unknown temp is retained and causes bounded fail-closed refusal; no existing identity or registry authority is reset to guess recovery. Arbitrary external deletion is not auto-repaired. Current shell Node22 is below project runtime; use verified local /opt/homebrew/opt/node@24/bin/node for checks.

## Next step

Commit/push this review-ready source and run the read-only Git handoff gate, reporting its actual immutable head to root. Root/source owner then review source, build distinct new candidate artifacts and execute real Linux fresh/repeat/renewal/reboot acceptance before their authorized main integration/release. Worker does not open PR, merge or operate production.
