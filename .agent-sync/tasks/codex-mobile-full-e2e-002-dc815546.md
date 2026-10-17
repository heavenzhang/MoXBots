<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-full-e2e-002 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 actual mobile WSS Host E2EE integration

## Objective

Add an explicit isolated source-combined actual MobileConnection → original service WSS/relay → original headless connector → original Node Host/worker/native SDK acceptance package. Root owns integration/main/deployment; this worker owns only this test package. Parent b217a4da8736bd336dbaf0ad368aec5030d2aa46 is a dependency merge and not owned implementation.

## Acceptance criteria

- [x] Original relay-enabled router, temporary AuthStore sessions, pinned public TLS, original identity/current binding checks; no handcrafted bearer, target, catalog or Session result.
- [x] Original account owners and actual WSS produce a reproducible directory red result at the b217 dependency.
- [ ] Legitimate original Host registry publication followed by first actual encrypted start, accepted receipt and original terminal.
- [ ] Continue with real staged file and same-operation duplicate suppression, if first chain passes.
- [ ] Root independent review/run and integration to actual main.

## Completed

Test-only service, headless and mobile fixture modules, Node original Host helper and explicit runner. The service/Node executor remain original owners. Concrete scope and all open gates: `dev-docs/mobile-002/full-e2e/acceptance.md`.

## Verification

All three locked no-run builds passed. Actual same-UID run_owned red retained; only existing explicit cfgtest socket adapter used afterward. Actual relay ready + mobile login/identity/enrollment/WSS succeeded, actual targets empty reproduced `ORIGINAL_HOST_AGENT_NOT_DISCOVERABLE`; no injection to bypass the first real design gap. No Cargo.lock, dependencies, frozen protocol or production guard changes.

## Blockers and unknowns

Accepted root catalog dependency 6e26946b has been normally merged. Original Devices/Agents default-disabled remote mount was reproduced, then explicit synthetic-user original revision/mutation PATCH enabled it. Actual target discovery now passes; first mobile.start fails at original headless inner TLS feed (NETWORK_TLS_FAILED). Root owns production chain repair. Temporary peer/connector cfgtest diagnostic diffs were removed and are not committed. Synthetic SSO, temporary encrypted OS adapter and controlled local supplier are explicitly bounded; phone/push/speech/production gates remain open. Deployment not required for this test package and not authorized to this worker.

## Next step

Merge root's accepted TLS-chain repair as a normal dependency, run `node scripts/verify-mobile-full-host-e2e.mjs`, and capture original encrypted start/receipt/terminal before expanding to attachments. Default-disabled negative case remains explicit; do not change production exposure defaults.
