# First-install Host registry acceptance

Task: MOXBOTS-HOST-INIT-001. Source delivery and publication remain pending until the gates below close. The human requires complete acceptance before main integration, followed by handoff to the existing unified deployment chat. The daily Mac client is excluded.

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
