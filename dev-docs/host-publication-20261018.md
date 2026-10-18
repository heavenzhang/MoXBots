# Ubuntu Host public distribution — 2026-10-18

Task `MOXBOTS-HOST-PUBLICATION-20261018` continues the original human request
`01a14c7c-05eb-7780-9fcc-7fbe938ee0a9` in chat
`01a13320-dbf9-7c03-b7f3-37e30d15de48`: Ubuntu24.04/x86_64 one-command installation,
real browser authorization, automatic enrollment and secure session renewal.
The current human separately designated this chat
`01a12b99-7b38-78b1-831f-9c60257d386a` for cloud/101 publication after handoff.
The original message was personally read, not inferred from a peer's summary.

## Scope and state

The existing cloud backend and101 release is accepted and closed by PR126;
see [production receipt](auth-renewal-production-20261018.md). This separate lane
only prepares the existing HTTPS origin's `/host` static software distribution.
No backend/101 reinstall, desktop updater, `/download` change, daily Mac operation,
new listener, model call, grant extension or new production test device is included.

Immutable files are staged; the public stable index remains **unavailable**. Original source/historical cloud
operator01a13320 explicitly withdrew all old unaccepted Host/static/Nginx requests,
reports no active/queued writes or leases, and confirmed no known accepted /host
job or shared-ingress transaction was omitted. The desktop publisher has not
answered the separate occupancy inquiry; this is not an ACK or lease. The new
target follows the actual human takeover and original one-command authority,
not silence. Before each short write, canonical ownership plus fresh actual
config/process/lock/lease admission must exclude conflicting writers. A real
occupancy blocks the window; an unrelated signing task is not evidence of one.

## Frozen bytes and trust

Use the existing candidate, without regenerating its gzip or release ID:

| Item | Accepted identity |
| --- | --- |
| Product source | `dcf8d9a60976c160e2b2aca33313c668c071132c` (clean actual main) |
| Release | `20261018032115-dcf8d9a60976` |
| `install.sh` SHA256 | `c317033d7bf4ae77160e2a528ae83e88d4f3edd4a59f771af2b98fba10a6853b` |
| `bootstrap.py` | 24272 bytes; `877fff3bf5810de7d20cc9a43ac2d49b6f9c28f29a39ba61ac3f54c168040e9c` |
| `bundle.tar.gz` | 171501596 bytes; `304be176df11f9d4a952dab560160e7bdbe7af0c92dfa9eeeba6435cff037ae2` |
| Nested Node archive | 163060594 bytes; `17243bdc34530807636c8acce03fd92cd40fd7d81f1a1a8f86750cce462c32be` |
| Native connector | 25736424 bytes; `bc998efe8a8afab7a328cc2c23b1e28afcfe98e91584fc290ad940a43f457acc` |

Primary independently executed the clean-M strict consumer: exact index schema,
full outer archive, seven listed member sizes/modes/hashes, source marker, Linux
x86_64 ELF, complete nested Host file manifest and exact M installer source passed.
Launcher and bootstrap match the original M producer byte-for-byte. Trust is
normal verified same-origin HTTPS plus SHA256 integrity; **no publisher signature**
is provided or claimed. Desktop updater keys are not used.

## Staged publication procedure

1. Re-read canonical ownership, actual Nginx serving layout, shared publisher
   window, current source/hash, website/updater pointers, service PIDs and locks.
   Acquire the four existing maintenance locks nonblocking, in their original
   order: `moxbots-cloud-model-center.lock`, `moxbots-login-ux.lock`,
   `moxbots-nginx-deploy.lock`, `moxbots-website-release.lock`. A held lock or
   updater `.release-lock` means wait; never force, kill or infer transfer.
2. Back up current ingress bytes/metadata privately and record the old state.
   Use root-owned `/srv/moxbots/host` directories with explicit755 permissions
   and644 public files (root umask077 must not make them unreadable).
   Never overwrite an immutable release. Reuse only exact matching bytes.
3. Stage only `/host/releases/<release>/{bootstrap.py,bundle.tar.gz}` first.
   Add a dedicated include inside the existing140 TLS server by exact-byte CAS;
   preserve all prior routes, listeners, certificates and proxy settings.
   Use exact stable paths and a closed immutable-path matcher, reject other
   `/host` files and directory listings. Retain stable `status: unavailable`
   until acceptance. `nginx -t` precedes a graceful Nginx reload; no cloud/Dex/101
   restart. Preserve website/updater file inventories and backend process PIDs.
4. Perform anonymous normal-TLS full public GET, exact sizes/SHA and strict
   consumer verification. Mirror these exact bytes to an isolated lab origin;
   do not modify M or bypass certificate verification to make the lab pass.
5. Run actual fresh disposable Ubuntu24/systemd255 with real Dex2.46.0,
   Chromium authorization/callback, original M AuthStore/service, Node and
   connector. Verify cancel/retry, same identity, real join/catalog/Ready,
   repeat-command zero login/join/rotation/restart, connector recovery and
   short-TTL natural renewal. Existing network-disabled systemd10phase and
   offline rejection tests remain separate evidence, not substitutes.
6. Only after required checks pass, place accepted `install.sh` and `stable.json`
   in one versioned publication directory and atomically CAS their shared
   `current` symlink. Keep the prior pair. Recheck public exact script/index,
   immutable byte identity and bounded route baselines.
7. On failure, rollback only if ingress/snippet/pointer still match this
   transaction's exact expected state. Restore only owned route/pointer changes;
   do not overwrite a later publisher or any auth database. Keep immutable bytes
   and private backups for audit. Report incomplete rollback if ownership changed.

## Acceptance boundaries

CI harness source and product source must be recorded separately. Lab accounts,
CA and keys are synthetic; production credentials/device IDs cannot enter CI.
Upload only a closed non-secret summary; no authorization URLs, PKCE/code/token,
Dex journal, browser trace/HAR or raw credentials.

A service restart does not establish VM reboot acceptance. If a hosted runner
cannot perform and resume after a true VM reboot, record that gate as unobserved.
Native daily-Mac Bots Ready UI and natural24h production renewal are also distinct
from isolated browser/short-session or durable server catalog evidence.

Private candidate and receipts reside under the project pointer's
`output/host-onboard-001/public-candidate-dcf` and
`output/host-publication-20261018`; no runtime files or secrets are committed here.

## Immutable staging receipt and remaining gates

PR127 merged as main `f6ddc0b41625c08d7aee6ae1ff1ae688608e5649` after nine applicable CI checks. The four original nonblocking locks admitted one short staging transaction on2026-10-18T10:53Z. Existing ingress exact-byte CAS, explicit public755/644 admission, nginx-user readability, `nginx -t` and graceful reload passed. Cloud/Dex/Nginx master PIDs and website/updater inventories stayed unchanged; no backend or101 change occurred. Private backup and owner-checked rollback readiness are retained. The exact immutable release is present and stable is the exact closed `schemaVersion:1,status:unavailable` index; staging is not installation acceptance or stable enablement.

Primary completed the sole anonymous normal-TLS public full GET:171501596 bytes, exact SHA304be176df11f9d4a952dab560160e7bdbe7af0c92dfa9eeeba6435cff037ae2, original M strict complete consumer and both gzip CRC-to-EOF checks passed. The15 external route baseline checks passed on retry after the bulk stream completed. The earlier TLS handshake timeout during the1Mbps stream is retained as a failed observation, not counted as a pass. Private receipts are public-transport-verification.json and routes-after-immutable.json.

The separate reboot/browser CI harness adds real KVM guest boot_id verification with no TCG fallback. Timeout budgets accommodate the measured public link. One cold standard run may export only the verified public bootstrap, bundle and fixed provenance metadata; subsequent renewal/reboot runs must name the reviewed same-repository run/artifact IDs, rerun all M consumer checks, and explicitly report cached transport rather than a new public download. Private lab keys/account/VM data are never upload paths. Public artifact permissions are explicitly checked from the actual nonroot runner user. Renewal must retain the original identity and Ready/IPC beyond the original60s account deadline plus3s, without a new login/join. Offline13 browser,8 reboot safety and20 consumer tests pass; actual browser, old-expiry and true-reboot runs remain pending. Product M/candidate bytes remain unchanged.


## Actual fresh-browser progress, not yet accepted

PR128 merged as main ffaf0005aedf88df49e127781020948bdb8cebe1 after nine applicable checks. Its actual cold run39122985915 verified the public bytes/M consumer before the native cancellation deadline failed. Only those three verified public cache files were exported as artifact12135552859, digest sha256:91c5edc5cd295e3ed587d1243e6b3e0d9b272a484012d5a1b31c07bf8b1c14d7. Later runs must name that reviewed pair, reverify metadata/size/SHA/full consumer, and report cached transport; a failed overall browser run is not a successful install. No extra public full download is required while immutable bytes stay identical.

PR129 repairs only disposable-test control and observations, without changing product M or its archives. Owner-only SIGINT reaches the verified original bootstrap; actual cached runs39126101408 and39126879253 completed the original native cancellation with exit130, AUTH_CANCELLED and successful server cancel, without account/session/join. The latter also passed the real AuthStore zero-state and route checks, then rejected its negative connector state predicate; actual state fields were not saved, so its exact terminal state is unknown. The repaired predicate saves only closed state enums and a zero-PID boolean before asserting loaded + inactive/failed + MainPID0. Active/transitional/nonzero/malformed states still fail; original positive Ready, same identity and no-join gates remain strict. Cleanup owns and terminates only the three initially absent lab auth transient units, with actual terminal/PID checks.

Primary reviewed the exact delta and reran25 browser and11 reboot safety tests on1deb1975c00e730e5b1b8a3e96dd3505eb7e9f07. Real standard cached run39127494986 and current-head normal CI39127316285 are pending. Natural post-original-expiry renewal and actual KVM reboot have not run. Stable remains unavailable; no repeat staging, cloud/101 change or daily Mac operation is authorized by these pending tests.
