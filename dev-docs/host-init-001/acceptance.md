# First-install Host registry acceptance

Task: MOXBOTS-HOST-INIT-001. Source delivery and publication remain pending until the gates below close. The human requires complete acceptance before main integration, followed by handoff to the existing unified deployment chat. The daily Mac client is excluded.

## Current release gate — 2026-10-19

P2 is **not publishable**: real KVM runs39142568416,39143984499 and39145714749 failed the original90s post-reboot Ready gate. The last run captured only closed `OWNED_ACCOUNT_UNAVAILABLE` startup errors (4), connector exit1/NRestarts5, healthy Node and intact identity/registry. This is not proof of the exact production errno. Full root8f133dda CI39145487973 passed9 applicable jobs.

Root normally integrated current maina6e9f9c9, retained every concurrent plan section, and reviewed the original-owner startup fix. `run` now restores the encrypted pinned connection locally; the original connector/backoff owns pending-renewal recovery, online account validation and first management authorization before listening. A captured account-binding fence prevents adopting a later login. Typed DNS/TCP/header-EOF availability can retry; TLS/trust/credential/revocation/grant/binding/unknown errors remain terminal. No new retry owner, timeout increase, registry seeding, installer workaround or production101 change is part of this Host repair.

Next exact product candidate **P3** is frozen at `80b119f34dae90709b0a7ea5284232f1b9497f0b`; later receipt-only commits do not change these bytes. Root independently ran the merged headless suite: **217 passed,2 existing explicit ignored**, and exact required clippy flags passed; browser51/reboot14 tooling tests passed. Additional all-source rustfmt check still reports inherited unformatted modules; no broad reformat or assertion suppression was made. A new producer, full combined CI, actual fresh browser/renewal/trueKVM gates, strict local/full-public verification, normal main delivery and stable CAS are still required. No P3 artifact/publication or successful real reboot is claimed yet. Separate native-password cloud maintenance has its own authority and records; daily Mac remains excluded.

## Product behavior and ownership

A genuinely fresh Host now creates its identity and authoritative empty `config.json` (`agents: []`) and `projects.json` through the original locked Node startup, before exposing local control, reverse management or catalog service. An immutable-identity-bound transaction records pending before identity publication; a checked atomic phase change consumes pending after both files are durable. Recovery accepts only that transaction's exact initial data and owned temporary/publication states. Complete existing registries remain untouched. Missing established files, partial/corrupt data, foreign links/temporaries and nonempty old workspace evidence fail closed.

`src/host/registry-bootstrap.ts` owns this lifecycle within the existing Host startup; `admin-config` exposes the original intent → projects → config lock domains. There is no new registry, Agent, provider, model credential, execution grant or network authority. Existing unjournaled incomplete installations require operator diagnosis; missing files alone are never permission to recreate authority.

## Evidence and limits

| Gate | Actual result |
| --- | --- |
| Primary code review | Worker commit8d112633 normally integrated; original Node owner, file-lock domains, descriptor/path checks, no-clobber publication and pending consumption inspected. |
| Primary actual process death | Five fresh synthetic private states killed via real SIGKILL immediately after pending/identity/projects/config/committed publication; new processes recovered the same selected HostID and committed real empty registry. All5 passed. Established identity loss rejected without a persistent change: sixth passed. Module SHA256b4a5ce871c2fda61e88209eafdf545e3585940479c7ad00f545c6ea621f2952d unchanged during probes. This is local filesystem/process evidence, not Ubuntu/systemd or power-loss certification. |
| Primary focused integration | Initializer38/catalog7/controller5/managementIPC11: all61 passed. Includes actual Host main/private socket, existing mutation preservation and original strict catalog. |
| Primary TypeScript | Full `tsc --noEmit` exited0 before the subsequent independent canonical diagnostic integration; final combined CI remains authoritative. |
| Combined candidate tools | Producer6/browser37/reboot13 offline tests passed. Real KVM capability was separately reported by the deployment owner; capability alone does not establish guest boot/reboot. |
| Additional local Session workers | First run parallel with typechecking: all3 timed out at the unchanged30s guard. Clean unmodified main118 isolated baseline:3/3 passed (37.81s). Combined-source isolated retry:2 passed, portable-provider case timed out after materialization; no timeout was extended and no assertion removed. Root cause remains unresolved. Supported Ubuntu CI must cover this existing suite before acceptance. |
| Exact-source candidate | Pending; all Node/native/service components must name the same new source, with strict consumer and real artifact digests. Old dcf release is preserved. |
| Actual Ubuntu24/x86_64/systemd | Fresh one-command → real Dex/Chromium → callback/poll → same intended scope → join → actual Ready/catalog/directory → repeat identity/config/Node PID preservation: pending. No fixture-seeded registry is allowed. |
| Renewal and reboot | Actual isolated same-source renewal and true guest reboot/identity recovery pending. Production TTL and the existing101 Host are not altered to accelerate tests. |
| Main and publication | Pending. Merge normally only after full required CI and supported-platform gates; verify remote containment. Current human-designated integration/publication owner01a12b99-7b38-78b1-831f-9c60257d386a verifies the exact accepted source/artifact identity before publication. Stable stays unavailable until that owner completes formal publication admission. |

Private evidence is under the project pointer's `output/host-init-001/`: draft-owner-review.json (historical failed draft), crash-review-IoSKsg/summary.json, baseline118-session-worker.log, retry-session-worker-isolated.log and tool-combination-tests.json. They contain synthetic local state only; no production credentials or account transactions are committed here.

The source primary performs no production upload, ingress edit, backend/101 restart, model call or daily Mac operation. Existing desktop/download/updater publication is outside this task's release lane.

## Explicit ownership transfer

On2026-10-18, the human explicitly selected this chat to take over integration and publication. Original owner01a13320 verified that human reply and released all integration/write/lease activity. The original worktree and dirty records remain preserved. Current delivery is tracked by `.agent-sync/tasks/codex-host-init-delivery-20261018-50e7aad8.md`. Main/publication are still pending, and historical failed Session tests remain open.

## Root takeover: exact candidate and refreshed integration (2026-10-18)

The explicit human transfer is complete; root owns source integration, PR137 and static `/host` publication. Original dirty records are preserved. Candidate P is frozen at `23ccbded83f2b6db8042c5e6be33b74c670b4809`, before unrelated concurrent background-task UI/server delivery `ad654f723`. That delivery is normally integrated into the main-delivery branch; it does not relabel or rebuild the already frozen P payload. The initializer/original startup/config-lock/native connector/AgentNet service sources still match P. Final combined CI must cover the newer main integration separately from the frozen release's isolated acceptance.

Candidate producer run `39136956964` succeeded at harness `857ff63e2ee25d20783d1c49641085de20ea4da0`, with original full strict consumer. New release `20261018144013-23ccbded83f2` is prepared, not public:

| File | Bytes | SHA256 |
| --- | ---: | --- |
| bootstrap.py | 24272 | d937206327a1f2109727b08e9f37303a67b02e8d74518b252b1ca0aec8f4bd0c |
| bundle.tar.gz | 171491680 | 61ac68f2472ce4e5e8abbf692b91554aff3b63befb515e20cec4b8d5715c32e0 |
| install.sh | 24313 | c317033d7bf4ae77160e2a528ae83e88d4f3edd4a59f771af2b98fba10a6853b |
| stable.json | 643 | bad36186bbefbe03efb9dc383daf79d0278c43e755bba9b2a4134d0d7a58e7b3 |
| same-P lab service | 27510672 | 59e2a8ed29d8c6c9dada0df284c58e76a34e05d2018582a2c45ae234fe6c64bd |

Candidate artifact `12140795230` (Actions ZIP digest `8bd4509e6aed6c1cdc5b13bede897a979e514eaa72fa5b5dd8e35a1c7138c7d2`); service artifact `12140730503` (`6a1748bc16b585caf514469be6b813885441cebe2dbd7f49549740a9214c542e`); closed producer receipt `12140615791` (`3a8afafc57c1e9cda2bbdc8f488700419139f58971c8b7bf406dcd78c788a30e`). These are authenticated CI artifact transfers, not public normal-TLS installer acceptance. Browser/reboot harness pins and service checkout are refreshed from this actual receipt; offline browser37/reboot13 pass and exact stable-byte reproduction matches the producer digest.

Historical run39135711670 failed the old mobile fixture order, with7 other applicable jobs passing. Its actual Ubuntu Session worker suite passed all3 tests in7963ms (job117699680375). Severe local compile pressure remains evidence about local diagnostics, not proof of a product deadlock. The two mobile fixtures now first boot/stop the real original Host before operator configuration; local plain/image/interactions passed, without seeded registry, looser timeout or changed product guard. Final Ubuntu/full exact-head CI and real candidate browser/renewal/KVM reboot remain pending. Public stable remains unavailable; no daily Mac operation.

### New actual failures remain open

Fresh-candidate standard run39137866962 accepted exact P service/launcher/bootstrap/bundle and strict consumer, real OS/Chromium CA, Dex discovery, service health and bad-digest rejection. First real install (`cancel` action) then exited1 before any authorization JSON, with start/poll/join counters all0; its109.416s failure is not proof of an authentication or registry cause. Cleanup passed. A closed metadata-only diagnostic is being added before repeating the same immutable candidate; no product change or public mutation is inferred.

Combined CI39137862794 failed `Verify original encrypted mobile and Host session chain` (job117706046236), Rust wait_json host-ready timeout. A third original fixture, scripts/fixtures/mobile-full-e2e-host.ts, also invoked the local operator before first original Host identity. It now starts/stops the actual original Node before that operator and verifies original empty registry, no calls, unchanged identity and configured registry across restart. Primary Node24 ESLint/diff-check and independent source review passed; actual Linux end-to-end verification remains required. Existing35s/60s waits and product guards are unchanged. The previous two fixture fixes do not cover this separate path. Required systemd was skipped after the dependency failure; it is not accepted.

### Fresh service HOME is now created independently of useradd skeletons

Same-P diagnostic run39139286069 retained every original gate and failed before authorization again. At20.568s the Node unit was not yet loaded, state/home canonical paths, dedicated UID and0700 mode all matched; state entries were fresh, but HOME contained an entry outside the bootstrap's allowed set. Registry/identity/marker/workspaces were missing. Node subsequently restarted with exit1 and the fixed Node-readiness/Host-own-rollback enums were observed. Thus the extra HOME content predates this Node startup; its exact name and provenance were deliberately not exported, so no specific `/etc/skel` item is claimed as the uniquely proven cause.

The new-account installer branch now passes `useradd --no-create-home`, then uses the existing `install -d` to create the dedicated0700 state/home. This makes nologin service initialization independent of machine-specific useradd skeletons. The existing-account and preexisting-state refusal branches, initial identity owner, three-file legacy-skeleton compatibility and unknown-authority guards are unchanged. No existing HOME is removed or repaired. Ubuntu's useradd contract is documented at https://manpages.ubuntu.com/manpages/noble/man8/useradd.8.html.

The actual fresh-browser harness adds an explicit post-Ready check that the new private HOME contains no inherited skeleton entries, while keeping strict authenticated Ready and all previous assertions. Offline browser41/reboot13/producer7, bash syntax and diff checks passed. Independent source assessment accepted the narrow new-account change; the new artifact's real Ubuntu install, repeat/identity preservation, rollback, renewal and KVM reboot remain required. Old candidateP23 and old public immutableM are preserved as historical failed candidates and are not the next published release.

Run39139281388 at08ad382f has now passed the complete headless connector job, including the repaired third encrypted Host chain and the two other original Host fixtures. The actual systemd job is no longer dependency-skipped; it remains pending for that older pre-HOME-fix head. Do not use it as acceptance of the new installer bytes.

### New exact-source candidate P2 (prepared, not accepted/public)

Producer run39140386138 succeeded from clean source `58d5247d7692acb816f211e1af7ef1891871bd6a`, release `20261018152704-58d5247d7692`. Candidate Actions artifact12141158740, ZIP digest64169cd911d2e0561f0d1b2cac25cafc32abdfaee23821d52d04c3a57e28014b; service artifact12141537459, ZIP digestab7eb4503b01ec5f29666fc7eed277fe26e40489374d154be413adf9fecd892b. The same-source service bytes are unchanged from P1 (27510672, SHA59e2a8ed29d8c6c9dada0df284c58e76a34e05d2018582a2c45ae234fe6c64bd); provenance sidecar is P2 from the actual new build.

| File | Bytes | SHA256 |
| --- | ---: | --- |
| bootstrap.py | 24272 | 522ee5f0d7a100c3a808bdd3a0745b31bc430138d2628d7a935d715ab74c3e5a |
| bundle.tar.gz | 171496242 | 3181bf17a51f1c5bd5cfe646af3ff3bddc4c0ae711e4f4120a795a60ad7c152c |
| install.sh | 24313 | c317033d7bf4ae77160e2a528ae83e88d4f3edd4a59f771af2b98fba10a6853b |
| stable.json | 643 | 697204f6c467b5f66c4555588ad9b65122f7bef01d90cabc3e60bd2b4a211002 |

Original strict full consumer passed in the producer. Primary reconstructed bootstrap and exact installer/stable bytes from P2 and matched these actual digests. No new public complete GET, browser install, renewal, reboot or new-source full CI is claimed yet. Old P1 failures and old M immutable paths are preserved.

### P2 real Ubuntu acceptance and final integration (2026-10-18)

This section is the current acceptance state; older P1/M failures above are retained history. Frozen product source remains `58d5247d7692acb816f211e1af7ef1891871bd6a`, R `20261018152704-58d5247d7692`, producer39140386138 and the exact payload digests above. Harness `f0ccd5d150652706f7cbea694268eb81bf011e9c` is independent of that product pin.

- Real standard browser run39141103331 passed all23 gates: genuine new Ubuntu/systemd install, original native cancellation without session/join, same-command real Chromium/Dex callback/poll/auto-join, strict DPoP empty catalog/Ready, no inherited HOME skeleton, repeat preserving identity/config/ciphertext/Node PID, and connector restart recovery. Summary SHA256 `79d07a7d4b01d50a89fa09b64c46d8d5a705a0b5354ecaf2360064f13d5fcd10`.
- Real renewal run39141765786 passed: natural60s lab AuthStore rotation and DPoP, Ready/Node IPC beyond original account expiry+3s, same session handle/principal/device, original keys/config and Node PID, zero additional browser login/join. One browser authorization total; cleanup completed. Summary SHA256 `d85e67eecece727163afec779ea061ac735d9493198b67ccf43fee15264ae8ff`. This is isolated synthetic-account evidence; production TTL remains86400 and the separate19Oct17:35 read-only natural-renewal follow-up remains scheduled.
- Exact-head PR CI39141026610 passed all9 applicable jobs (iOS conditional skip). Original full Host/mobile E2Es, Session tests and actual Ubuntu/systemd installation are included. Systemd receipt SHA256 `c025a86878cf0a03061ba2f8e4d76e4edbfa9118f9af140479dc0db1fae2ed62`: all10 phases passed, including real IPC/encrypted credential loading, same-version no-op, flock contention, busy-update refusal and second-component ownership rollback. It names synthetic PR merge sourceeee1476a, not frozen P2 release. Unintended duplicate manual Test39141095371 at the same head also passed; no further duplicate Test dispatch.
- True KVM guest reboot run39142568416 is dispatched with the same P2 producer/artifact; its real reboot and identity recovery are still pending. Capability-only39133387363 is not counted as reboot acceptance.
- Current main8e60805e (goal status and desktop updater changes) is normally integrated before final delivery. Compared against P2, Host startup/connector/identity/AgentNet/install/bootstrap/prepare-release source paths remain byte-identical; frozen artifacts are neither relabeled nor rebuilt. New combined exact-head CI is still required before merge.

These runs use authenticated candidate artifacts, not a new public origin/full TLS GET. Static append/promotion, remote main delivery and post-publication validation remain pending. No daily Mac operation or cloud/101 redeployment is part of this installer correction. Separate mobile password-login work remains off in production until its own consent/provider/main/CI release gates close.

### P2 true reboot run: failure retained, publication blocked

Actual KVM run39142568416 passed all26 preceding gates, including normal guest CA/loopback forwarding, real cancellation/browser authorization/join/Ready/repeat/connector restart and a genuine new kernel boot ID on the same VM. It then failed `original-Host-boot-autostart-Ready-and-Node-IPC` at the original90s bounded-readiness deadline. Summary SHA256 `84066c038bf2f621bb55bb2d3254cf7a6030b2a4e5f3758c751fcb2228817645`; cleanup completed, no TCG fallback. A new boot ID alone is not accepted recovery. Closed read-only last-poll/runtime metadata will be added before repeating the same P2 bytes; no product root cause is asserted, no deadline/identity check is weakened, and no public pointer/main promotion is authorized by this failed run.

### Closed postboot diagnosis and required CI repair

Diagnostic-only KVM39143984499 (harnessc6c38d0f, unchanged P2) repeated the failure. Summary SHA256 `748f846e5eaabbe982037b4abe481af47d08057ed3d5da4d15a515db28831913`: Node is active/doctor healthy, original identity/committed marker and both authoritative registry files are intact. Connector is failed with exit1, status is an empty correctly owned0640 file, and management socket is absent. Readiness failed after90.287s; all105 polls and cleanup are recorded. This localizes the failure before connector readiness but does not prove a specific CLI error or start-limit. The next bounded observer will export only known startup-code enums and restart metadata, never raw journal or credentials. Product/source publication remains blocked.

Candidate P2 Actions ZIP171521363 bytes/digest, exact three member whitelist/hashes/ZIP CRC, complete original P2 consumer and outer+nested gzip CRC are independently verified locally. This is authenticated artifact integrity evidence, not public full HTTPS transport or installation acceptance.

Current combined CI39143964717 atc6c38d0f passed8 applicable jobs, including native macOS, and failed only `npm run test:dom`:2604 DOM cases passed; the large-review PermissionPrompt exact-copy case missed its transient copied label. Product and test paths are byte-identical to the prior f0 green run. The test now controls the feedback clock only after complete review arrival, preserves disabled/enabled approval and full/exact command assertions, flushes the async copy with act, and unmounts before restoring real timers. No product code, timeout increase or dropped assertion. Independent source review found no P1/P2; root Node24 targeted DOM11/11 passed (6.288s tests;67.82s total under local compile load). A new exact-head full CI is still required; an old green run is not reused for changed head.

## P4 source and local artifact closure — 2026-10-19

P3 CI39222022483 exposed the missing mobile projection direct hyper dependency; its artifact is not promoted. P4 freezes `7e4bbdfaa693b3f309c7a879b32d1b386b3b52ca`, retaining all locked package versions, with mobile122 tests and actual iOS device/simulator builds accepted. Producer39223945533 succeeded once; candidate artifact12172139712 is171580390B/SHA4fab3b4c4d32df0980b68d7b6a6da66c14073aaaa5b13ceaf8a4df140259bbf1.

Release20261019083714-7e4bbdfaa693 contains bootstrap24272B/SHA3b3ec7775261318feaf396a50c6be9bb082996dbf2b6d6cfb4ddc217fbf62164 and bundle171555269B/SHA427a2076dffecf9e4a12700cfdf283e6aae81bb3d6660bfa0f8cfb9c7f8c54b4. Same-source lab service artifact12172099959 contains27751952B/SHAa3c6cd939e624297b5f18b8267c58e32e3bfb7af95376a5851583ce0c0ea441a. It is not a production cloud upgrade.

Root completely downloaded the candidate ZIP and passed three-entry CRC/whitelist, producer metadata, frozen bootstrap/install/stable byte reproduction, original strict bundle/nested Host consumer, every manifest mode/size/SHA/source and x86ELF, and both gzip EOF/CRC. Original consumerSHA c60f0eaeee71da5666d7ce6d5917c9f8da79c6bc1e0c17b5d0453e401d2e0c86. Private local-full-verification.json retains the closed receipt. Harness51/reboot14 offline tests passed at new P4 pins. Real P4 standard/renewal/KVM and finalCI/main remain pending; public transport and publication remain unaccepted.

## P4 real acceptance closure — 2026-10-19

The exact P4 artifact/service pair passed standard39225566407 (23 gates), natural lab renewal39226095343 (25 gates), and trueKVM39226946194 (28 gates), all at harnessb5bb22351dfa7198b9e2e8d59e17fb90d5b563bb. Root verified source/artifact pins, all gates and completed cleanup. RealKVM changed bootID while preserving VM UUID and original identity/config/key/ciphertext, and reached fresh Ready/Node IPC in4.35s with zero new login/join and zero unit restarts. The normal90s recovery predicate was unchanged. Original failed P2 attempts remain above. Lab60s natural rotation crossed its original expiry+3s; it is not production24h observation. Exact closed SHA receipts: P4-acceptance.json. Final current-main/CI and real public transport/promotion are separately recorded by PR137 and the owned private execution-status; this checkpoint does not claim those future steps.
