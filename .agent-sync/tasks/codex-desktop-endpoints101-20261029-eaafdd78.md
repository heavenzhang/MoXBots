<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/desktop-endpoints101-20261029 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-CLOUD-MIGRATION-101-20261029 desktop service and updater endpoints

## Objective

MOXBOTS-CLOUD-MIGRATION-101-20261029 desktop/updater portion: point MoXBots product website/download, owned cloud default and signed updater publication at101.42.11.29. Root01a12bc2 remains sole desktop/updater/sharedCI/main owner. Cloud/website/mobile coordinator01a12b99 owns server deployment. Human explicitly permits a fresh test cloud/database/identity domain; preserve old140 data, existing local device keys and updater signing root.

## Acceptance criteria

- [x] Website/download stay under /moxbots/ without displacing AI4S root/admin/download/assets.
- [x] Embedded updater and publisher agree on /updates/stable/{{target}}.json and immutable archives.
- [x] Keep updater public key, versions, credentials, existing trust guards and old release bytes unchanged.
- [x] Scoped product profile and publisher signature/immutable/hostile archive checks pass locally.
- [ ] Review combined cloud/new-origin changes; exact sharedCI and normalmain delivery.
- [ ] New candidate signed artifact and real new-cloud login/update/local installation acceptance.

## Completed

- Isolated branch from actual canonical caab; original frozen5251/source45a unchanged.
- Changed appProfile website, tauri moxbot endpoint, registry default origin and updater publisher origin; updated restricted Nginx example/runbook only, no server action.
- Four profile/link regression cases; publisher rejects old140 and arbitrary external artifact origins, retains signature and immutable-release rules.
- Detailed interface and migration boundaries: dev-docs/cloud-migration-101/desktop-updater.md.

## Verification

- 4 profile/link unit tests PASS (production/isolatedQA/upstream).
- 3 node publisher tests PASS, including actual CLI fixture signing/verification, immutable promotion/rollback and hostile archive rejection. Temporary fixture keys only; production key not read/copied.
- Test classification PASS. Full TypeScript --noEmit exit0; independent scoped ESLint --max-warnings=0 exit0; git diff --check PASS.
- No sharedCI/main/artifact/server/native claim yet; no business or credential mutation.

## Blockers and unknowns

- Cloud owner is preparing new test cloud source/101 shared-ingress readiness; original cloud DB restoration waived by explicit human decision, not silently lost.
- Existing524 clients embed old140 URL;101 upload cannot redirect that IP. New signed installer or reachable compatibility bridge required.
- New cloud identity is distinct: no oldissuer trust/pin bypass or credential relabel. Actual login/Ready not yet verified.
- No endpoint source changes mixed into frozen45a; this patch will enter a separately reviewed combined candidate.

## Next step

Push exact patch and verify handoff; await cloud source for single coordinated CI/main integration. Continue current PR208/209 CI independently, do not launch redundant CI or deploy101.
