<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-testflight-20261022 -->
<!-- git-project-sync-task:base=263b1cf5c064c7ee5f375fd5c3f5697854e35723 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-MOBILE-TESTFLIGHT-20261022

## Objective

Use the existing Apple developer account to deliver an actually installable TestFlight invitation for the human-selected second iPhone. In parallel, assess official wireless installation through its existing pairing. Preserve the original phone, user data, daily Mac client and original101 identity/configuration.

The human request was independently read in source chat01a1488b, turn01a15fa9: upload to TestFlight using the existing account and return a link the other iPhone can install; its follow-up explicitly selected Kevin. This chat01a12b99 remains sole mobile CI/build/sign/distribution/install/acceptance owner. Desktop/updater ownership remains01a12bc2; native GUI handback is required before sharing its surface. Source chat remains independent read-only preparation/review.

## Acceptance criteria

- [x] Verify canonical repository, actual protected main source, ownership and explicit target.
- [x] Read existing pairing/development-profile compatibility without operating other devices.
- [ ] Establish original paired wireless transport and, if available, verify an appropriate controlled installation on the selected target; an unavailable tunnel is not an installation.
- [ ] Verify actual App Store Connect session/role/app/build inventory and matching distribution-signing capability; reuse existing suitable artifacts/links first.
- [ ] Pin protected source, allocate an unused legal build number, coordinate one necessary mobile CI batch, build and verify an App Store distribution archive with exact provenance and digest.
- [ ] Validate/upload, observe processing, answer export questions from verified facts, finish any required Beta App Review, and verify a compatible build is actually available through the invitation.
- [ ] Limit an external self-use invitation group to a small audience without adding unrelated internal roles, marketing or unsolicited email.
- [ ] Keep source/main, CI, signing/archive, upload, processing/review, invitation and actual installation as separate states.

## Completed and verification

Start/task-init gates PASS on actual main263b1cf5c064c7ee5f375fd5c3f5697854e35723. Existing0.1.0/build2 mobile app sources/dependencies are unchanged relative to its original source, but shared native inputs and distribution settings require their own validation; no provenance equivalence for a new archive is inferred. The old development archive remains immutable.

Official devicectl identified the selected paired physical phone, currently iOS27.2; existing development profile covers it. Trusted wireless connectivity assertion returned4016 and one targeted official pairing attempt returned4000. No pairing was cleared, no device rebooted, and no substitute phone installed. Apple documents wireless pairing in Device Hub for iOS27+; a cable requirement is not inferred from this failure.

Read-only signing metadata found an existing development profile but did not establish a matching distribution identity. Standard documented altool API-key locations have no registered key. The background Apple Developer page requires authentication; App Store Connect inventory and any existing public invitation remain unverified. No private key/password was read back, no Keychain/search-list/global proxy/TCC setting changed, and no Apple credential or role created.

## Blockers and unknowns

The desktop owner is finishing an in-flight native read-only check and will explicitly hand back a short Xcode Accounts/Device Hub window. Until then, no shared native input. Actual selected-team capability, ASC app record, distribution provisioning, highest uploaded build number, export classification and review metadata must be verified, not invented. No upload, invitation or installation success is claimed.

## Next step

Use the explicit GUI window to read the existing Xcode account/team capability and selected phone's official nearby-pairing state; return the window immediately. Continue ASC authentication/inventory independently where possible. Request only a concrete unresolved Apple verification or fact after inspecting existing configuration. Private receipts are in the project pointer output/mobile-testflight-20261022; credentials, device records and generated applications stay outside Git.
