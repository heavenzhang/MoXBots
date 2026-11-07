<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-native-readiness-0543-20261107 -->
<!-- git-project-sync-task:base=a650939d2c38b8dc04750e282b159ddaac8ea346 -->
<!-- git-project-sync-task:status=completed -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Repair first-send restore readiness and cold recovery inspection; preserve unknown evidence

## Objective

Completed desktop/macOS-arm64/updater delivery for MB-NATIVE-READINESS-REPAIR-20261107: MoXBots 0.5.43/build543.8. The sole desktop/sharedCI/main/release owner remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. Preserve original business, drafts, unknown-operation records, immutable prior packages and rollback. Website static download publication remains with its existing independent owner; it is not a missing desktop release step.

## Acceptance criteria

- [x] First-send restore readiness and original cold unknown inspection accepted within the native version matrix below; no business replay or ledger clearing.
- [x] Exact source and release-main CI each passed nine applicable jobs; conditional iOS skip is not a PASS. Owned workflow paths were unchanged and not triggered, not reported as success.
- [x] Same signed/notarized immutable archive installed locally and promoted to the 101 formal updater after necessary native acceptance; normal TLS full-body digest and production signature verified.
- [x] Original 155 Session IDs, 647 history/ledger files and all 20 Agent configuration objects retained; original business report and unknown-operation evidence unchanged.
- [x] Existing stable542.6 backed up before atomic existing-stable CAS; old archive/rollback preserved, only this release's publisher lock released.

## Completed

- Frozen artifact source: 755d4805553dd2b60a39dda4648e4ead5f725708; tree cfb074dbe38e5e1df301abd59e3919d71d81412d. PR260 merged normally once to release main cc9ce8d492108710b5e8445b438e8843d776b060, with exact tested/source whole-tree equality.
- Immutable annotated tag v0.5.43 object ee663e945496e44d914578a73433d7201e10ded1 peels to that release main. Later documentation commits do not redefine the frozen source, release tag or archive.
- Archive: 302330623 bytes, SHA256 a401ff492cda79b6352b0aab44a96f4fb1ad3c45a339f4834640f2e4754d4f4e. Installed /Applications/MoXBots.app 0.5.43/543.8 binary SHA256 79e3eaa158141cbc1b311a5f3f4e4ef7de4b554c03fcf116aa2dd32595449f49. Build/sign/Apple/archive/install/publication each executed once for this candidate.
- Apple f20b22fe-6642-419a-8ce8-634fde91284e Accepted, exact ZIP/no issues. Original fixed Reader e99409ad3e881b202d3adda27f8b98b580ae177df3563cbc73243ad448d87b04 unchanged; no recompile/resign/manual execution.
- Formal stable: https://101.42.11.29/updates/stable/darwin-aarch64.json, manifest SHA256 f0d87d37bd209f1ca3369e3470ccffc080382f5568e1cab386f2ff3476806dd4. Immutable archive: https://101.42.11.29/updates/releases/0.5.43/a401ff492cda79b6352b0aab44a96f4fb1ad3c45a339f4834640f2e4754d4f4e-MoXBots.app.tar.gz.
- One complete normal-TLS external GET matched the original archive and production updater signature; atomic promotion, exact manifest/no-store, two Range206, hidden404, unsupported204 and self-lock release passed. Native Check Update once showed “当前已是最新版本”; original unsent draft view restored without sending it.

## Verification

- Source Test42324916161 and release-main Test42328417779: each actual nine successes/iOS conditional skip, including actual ARM and Windows. Original jobs/run/provenance receipts are retained in the owner evidence directory.
- R4 source checks: 388 unit, 378 distinct integration, three version contracts, type/scoped lint/classification/diff PASS. These source fixtures are not real Provider or production Goal proof.
- Actual installed543.8: original N02 cold unknown notice/exact tool/read-only reopen; foreground HTTP502 preserved rather than499 with unfinished steps and stored/reopened state; one pre-header socket recovery with one exclusive QA operation/file; separate transient502 followed by one text answer after automatic wait. These use the installed real SDK with a controlled loopback upstream, not a real Provider/full Goal claim. Temporary provider disabled and both fixtures normally exited; original configuration exact.
- Retained actual native matrix: 543.5 first-dialog send, N04 upscroll and N05 selection; 543.6 actual Codex approval same-request reopen/allow-once/file terminal and live reading details across terminal. Renderer/shared/Codex adapter/package-lock bytes are identical through543.8; retained component evidence is not reported as rerunning all cases on543.8.
- Authoritative delivery/evidence: work/native-readiness-repair-20261107/owner/DELIVERY-RESULT.json and DELIVERY-EVIDENCE.json; candidate-5438-755d4805/native-acceptance.json, native-updater-final.json, source-tag-receipt.json, final-native-retention.json and publication controls/raw readback. Private runtime data and credentials are not committed.

## Blockers and unknowns

- No blocking desktop release finding remains. Automatic restart draft restoration has not passed; exact manual restore/tab navigation passed. Separate HTML report preview was not reverified on543.8, while original report text/links/accepted state were read-only verified.
- Socket QA Goal ended no_progress; the accepted scope is transport recovery and one actual operation/file, not Goal completion. Full model/Goal matrix questions remain pending and cloud browser login remains human-deferred.
- Website /moxbots/download/ static publication is AVAILABLE_TO_EXISTING_OWNER_PENDING_ACK_AND_WEBSITE_PUBLICATION in work/release-queue/WEB-DOWNLOAD-0543-5438.json, owner01a12b99-7b38-78b1-831f-9c60257d386a. A durable queue entry does not claim notification, ACK or website acceptance. No Root Nginx/cloud/mobile/device mutation.

## Next step

Desktop release complete. The existing website owner may publish the queued exact archive/static materials and record its own normal-TLS page acceptance. Later metadata-only main commits preserve the release tag/source/artifact mapping; no rebuild, resign, Apple resubmission, installation or repeated native acceptance is needed for this record correction.

## Historical candidate preparation and failures

The following R2–R4 preparation entries are retained as historical evidence. Their pending/hold statements describe those points in time and do not override the completed543.8 delivery above. Original failed candidates, logs, packages and rollback remain immutable.

## R2 next immutable5436 — 5435 original N02 failure

5435 first build/sign/Apple/archive/install completed once; actual sourceCI9success/iOSskip and sameMac full12 passed. Original7b remained unchanged, but readiness triggered readonlyGET still409 because SDK listing summary was undefined while actual SDK selected12/raw36 history existed. Do not rebuild or publish5435. Root reviewed exact5f4e3b501 read-only reader fix and independent review: SDK retains path/identity authority; available summary id/size preflight remains, absent summary rawimport batch1 collected with50k/64MiB accepted serialized evidence limits. SDK per-record preparse allocation is not a hard raw-file memory cap. Execution/selected-chain proof/unknownledger/Store/reconcile gates unchanged.

Root merged5f4e once locally into existing release branch; only shared-plan append conflict resolved retaining both full sections. Allocate new build543.6. Combined targeted checks, exactupdatedPR260 CI and new immutable artifact/install/native still pending; required originalN02 and actual native gates must pass before main/public. No original business messages/replay/ledger edits or global Agent permission changes. Native5435 evidence: firstdialog one send/one reply, N03 actual same request close/reopen and allowonce/file terminal PASS; N04 manual upscroll across real terminal PASS. N05/N06 and controlled transport diagnostics still pending; these are not5436 native acceptance.

Next: finish current finite native reading cases on5435 while preparing scoped combined reader checks, then freeze/push exact5436 source to existing PR260. Published5426/oldarchives remain immutable.

R2 combined check result: 123unit/24actual-adapter-and-Store integration (147total/7files), complete TypeScript/scopedlint/classification/diff all PASS; 3version-contract tests PASS. Preserved producer113unit/33integration original log hashes. Existing coldN02native and live detail/transport gates remain pending, no main/public admission.


## R3 / build543.7: exact native rejection response owner

5436 build/sign/Apple/archive/install each once, exactCI9success/iOSskip, N01–N06 necessary native UI coverage accepted with versionlimits. Original7b fourfiles/START unchanged, Codex approvalonce/file/terminal, live readingdetails retained throughterminal, original completedreport reopened readonly, 20Agent/global/pool retained. Temporaryloopback providers disabled; unsent businessdraft manually restoredexact, automaticrestartrestore notPASS. Native finiteHTTP502 with RetryAfter3600 insteadbecame499, so5436main/public remainHOLD.

Root reviewed remote66b663155d72d177868fe2ee9298ae2b169fa6ab (256unit/94integration originalhashlogs) and merged componentlocally. Independent Root exactpaused-isCurrent regression still RED against that source, preserved privately; producerinitialtests didnotreplicate isActive/scope withdrawal. Root closesactual wiring with a narrow same-root/route responseproof that can only return a bounded alreadyreceived rejection or sealed exactfingerprint. Strict isLive/newrequest/retry/context protections unchanged; realabort/synchronousinterrupt/retiredtoken/root/route stillcancel, differentfingerprintpaused cannotdispatch. No businessreplay, unknownclear, newproviderpermission or retrybudget. Version543.7 reserved, sourcefreeze/CI/formal/install/main/public stillpending independently.

Verification: Root firstactualwire RED499vs502 preserved, corrected realSessionModelRecovery + two realHTTP protocols/builtinwrapper and negative controls; final exactcombined checks recorded aftercompletion. Scopeonlynecessary bridge/wiring/tests/docs/buildnumber. Next: finish exactsourcechecks, freeze/push once existingPR260; newimmutablelocalcandidate and actualfinitecause/recovery acceptance beforemain/public.

R3 final source checks: actual278unit/4files +104integration/4files, corrected-const3exactwirecases, complete type/scopedlint/classification/3versioncontracts/diff PASS. OriginalRootWIP exactwireRED and initialtwo prefer-const lintfail preserved privately, corrected withoutweakening assertions. Renderer/shared/Codex adapter/package-lock exactunchangedfrom5436; nativeversioncoverage remains explicitlyscoped. Sourceaccepted fornew543.7localcandidate, notmain/publicadmission.


## R4 / build543.8: complete rejection through both recovery wrappers

5437 exactsource5885 CI9success/iOSskip, build/sign/Apple/archive/install each1, retention153originalIDs/641historyledger/20Agentobjects PASS. Native noStop foreground received502 with paused recovery but displayed499; the independent directTask preserved502. Public/main remainHOLD and oldarchive/rollback immutable. Root isolated exact5437 class composition reproduces inner502→outer499; ContextRecovery.run cancelled the failed response when its own paused-sensitive isActive becamefalse after awaitexecute. Both originalRED and firstimplementation readback-before-lease-finish failure are preserved privately, notclaimedfirstgreen.

R4 adds an in-memory WeakMap capability only to complete failed responses read back from the existing ModelFailover Query guard. Context can seal and forward that same failed response only while the inner proof and its own exact scope/route/state/abort/ledger/recovery conditions remainvalid, checked again after boundedbodyreading. A paused samefingerprint may read its sealed terminal withoutdispatch; a distinctinput/Stop/abort/oldroot/route/background/endTurn hasno capability. HTTPheaders/body cannot forgeit. No active/request/tool/retry/Store/unknown guard or budget is relaxed; no private token/responsebody is added to logs.

Actualhandler+Context+factory+SessionModelRecovery loopback tests cover both protocols, readback/noreplay and revocations. Additional actual agent-session registeredbridge tests retain originalFIFO vs MFderivedscope and persistedpause, with a syntheticSDK input pump; these do notclaim realSDK/native terminal acceptance. Existingnative N01–N06 renderer/Codex matrix staysscoped; fullmodel/Goal twoquestions remainpending. New5438 frozen source/CI/formal/native/main/101 steps require independent exactresults. Next: completefinalchecks/sourceadmission, normalFFpush existingPR260, newimmutablecandidate and true installed foreground502/unfinishedsteps beforemain/public.

R4 final checks: 388unit/7files +378distinctintegration/6files (134composedwrapper including12newcases +244actualagent-session fixturecases), complete type/scopedlint/classification/diff and3versioncontracts PASS. New2registeredbridge tests use syntheticSDK frames and real isolated Store/actualcallback bindings; installedSDK/native remainspending. Initialfixture callback/parkedQuery cleanup assertion errors and lint prefer-const failure retained and corrected without production guard changes. Next freeze/push existingPR260 exact543.8source; no main/public admission until real new foregroundHTTP cause/unfinishedsteps and recovery pass.
