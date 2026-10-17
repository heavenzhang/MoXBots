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
- [x] Legitimate original Host registry publication followed by first actual encrypted start, accepted receipt and original terminal (accepted root dependency 959d632e).
- [x] Explicit assets mode: real Rust encrypted uploads, same Session continuation, byte/hash supplier/materialization checks, Native duplicate suppression and receipt recovery (13.36s).
- [ ] Root independent review/run and integration to actual main.

## Completed

Test-only service, headless and mobile fixture modules, Node original Host helper and explicit runner. The service/Node executor remain original owners. Concrete scope and all open gates: `dev-docs/mobile-002/full-e2e/acceptance.md`.

## Verification

All three locked no-run builds passed. Actual same-UID run_owned red retained; only existing explicit cfgtest socket adapter used afterward. Actual relay ready + mobile login/identity/enrollment/WSS succeeded, actual targets empty reproduced `ORIGINAL_HOST_AGENT_NOT_DISCOVERABLE`; no injection to bypass the first real design gap. No Cargo.lock, dependencies, frozen protocol or production guard changes.

## Blockers and unknowns

Root accepted catalog, full certificate chain and IPC repairs were normally merged through 959d632e, retaining this task's genuine base. New assets result, test-adapter deletion semantics, default debug stack diagnosis and exact cleanup evidence are in `dev-docs/mobile-002/full-e2e/attachments.md`. A subsequent default-text regression failed once after accepted receipt with MOBILE_CHANNEL_CLOSED around 30s; no retry or production bypass. Root owns source diagnosis/repair. Root integration/main and all phone/OS/production gates remain open.

## Next step

Root independently review and run owned attachment increment, diagnose retained default-text failure, then integrate. Separate controlled small-stack C ABI probe is deferred until this package is accepted. Deployment is outside this worker scope.
