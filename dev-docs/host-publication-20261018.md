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

Public distribution is **not published**. The shared Nginx/static publication
window is pending reconciliation with the existing publisher. No target-changing
action is allowed until the scoped owner is recorded on main and competing
active/queued transactions have been explicitly reconciled.

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
