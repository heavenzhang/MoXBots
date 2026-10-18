# Linux Host test package

## One-command owned Host enrollment candidate

`one-command.py` and `prepare-release.py` implement the maintained public entry
`<owned HTTPS origin>/host/install.sh --instance <same origin>` for the fixed
`moxbot-test` namespace on **Ubuntu 24.04 x86_64 only**. This is source and local
release preparation; no public release or real browser enrollment is implied by
these files. The product must show the command only after a verified available
index from its selected owned instance. Missing/404/unavailable indices mean the
installer is not published yet.

After publication, the user runs one command (the origin below is a placeholder):

```sh
curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://owned.example/host/install.sh | sudo bash -s -- --instance https://owned.example
```

The command contains no credentials. It checks Ubuntu/architecture/root, obtains
the bounded index over verified HTTPS without redirects or proxy/cookie/credential
headers, verifies the immutable bootstrap and bundle sizes and SHA-256, validates
the complete bundle and Host file manifests, and invokes the existing unified
installer. Its shared transaction lock remains held through installation, browser
authorization, same-principal management renewal when needed, explicit enrollment,
boot activation, native readiness, Node IPC readiness and the final HostID output.
The short authorization URL is forwarded only to the invoking terminal by the
existing `systemd-run --pipe` control. It is never captured or written by the
installer. Browser authorization is still a human action on another device.

An already usable installation reuses its account, keys, identity, configuration,
release and Node PID. A prior completed login can recover its join without a new
login. Connection/trust/corrupt-state failures stop with an actionable incomplete
state rather than automatically rotating authorization. Cancellation or expired
authorization preserves identity/configuration; rerun the same command to recover.
Existing running connectors are left running on a failed check. Changed IPC
drop-ins require an idle Node Host before restart. No code here deletes identity
pins, changes principal/scope, enables execution/cloud models, extends finite
execution/model grants or calls a model.

Trust is **verified HTTPS same-origin transport plus SHA-256 integrity**. This
path does not provide or claim a publisher signature, and does not repurpose the
desktop updater's minisign key. The stable shell script is trusted through the
selected origin's normal TLS certificate verification. Every subsequent executable
byte is staged privately and checked before execution. Release metadata can name
only the exact fixed paths below; arbitrary URLs, redirects, encoded traversal,
archive links/special files, duplicate paths and unlisted files are rejected.

`GET /host/stable.json` is limited to 16 KiB and accepts an exact object:

```text
{ schemaVersion: 1, status: "unavailable" }
```

or, when actually prepared and published, all of these exact fields:

```text
schemaVersion: 1
status: "available"
profile: "moxbot-test"
platform: "ubuntu-24.04-x86_64"
scriptPath: "/host/install.sh"
releaseId: "<14-digit UTC timestamp>-<sourceCommit first 12 hex>"
sourceCommit: "<40 lowercase hex>"
bootstrapPath: "/host/releases/<releaseId>/bootstrap.py"
bootstrapSha256: "<64 lowercase hex>"
bootstrapBytes: <integer 1..262144>
bundlePath: "/host/releases/<releaseId>/bundle.tar.gz"
bundleSha256: "<64 lowercase hex>"
bundleBytes: <integer 1..2147483648>
```

The bundle contains only `manifest.json`, `host.tar.gz`,
`network/{myagents-host-network,source-commit.txt}` and
`installers/{install.sh,unified-install.py,network-install.py,network-control.py}`.
The outer manifest pins exact file bytes, sizes and modes. Host source must be
clean, profile/target/release must match, and Host, native connector and pinned
installer source must name the same full commit. The preparation tool validates
all components and verifies the final archive again before creating its candidate
directory. It refuses dirty/changed source and existing output directories.

Prepare from the final combined clean commit, with a Host archive built by
`MYAGENTS_HOST_PROFILE=moxbot-test node scripts/host/build.mjs` and a Linux x86_64
native CI artifact from that same commit:

```sh
python3 scripts/host/prepare-release.py \
  --host-archive /absolute/path/to/moxbot-host-test-<releaseId>.tar.gz \
  --network-artifact-dir /absolute/path/to/native-ci-artifact \
  --output /absolute/path/outside-checkout/host-candidate
```

The new output contains `install.sh`, `stable.json`,
`releases/<releaseId>/{bootstrap.py,bundle.tar.gz}` and `release-review.json` with
actual derived digests and `publication: not-published`. The unified deployment
owner must review/serve the immutable release directory first, then update the
stable script and index; publication and acceptance are separate gates. Never
publish synthetic fixture values or overwrite a release directory. Roll back the
stable index/script together to a retained previously accepted release; installed
version changes retain the existing installers' stop/backup/rollback requirements.

### Isolated Ubuntu acceptance

Use a disposable Ubuntu 24.04 x86_64 VM with systemd 255 and no access to existing
production Hosts or daily desktop state. Install the ordinary `curl`, `python3`,
`bash`, `tar`, `sha256sum`, `getconf`, `flock`, `sudo` and `systemd-creds` tools.
Serve the prepared candidate at one test HTTPS origin with a certificate trusted
by that VM; keep both metadata and bundle on the exact same origin. Use a dedicated
test account on an isolated owned-service instance with execution/cloud models
disabled. A local fake service can exercise rejection paths, but cannot establish
real native browser/DPoP/network acceptance.

1. Record the candidate's review JSON/source SHA; snapshot the VM. Run the public
   command, complete browser authorization without recording its URL, and verify
   final HostID, both fixed units active/enabled, ready projection and Node doctor.
2. Repeat exactly; compare Node PID and identity/config/encrypted-key hashes. No
   browser prompt, renewal/rotation, new identity or restart is acceptable.
3. Reboot the VM and verify the same identity, native readiness and Node IPC;
   confirm no new TCP listener and no execution grant or model call.
4. Restore the clean VM snapshot for bad digest, foreign path/origin/profile/source,
   oversized manifest, archive links/traversal, concurrent installer and canceled/
   expired browser tests. Verify no install before validation and preserved state
   on cancellation. Resume by rerunning the same public command.
5. On a separate installed snapshot, test a different release while active/busy
   (refused), stopped update, injected second-component failure and verified
   rollback. Back up identity/config/encrypted files privately before this test.
   Existing offline tests cover root/systemd fixtures and rollback logic; they do
   not substitute for these actual systemd/browser checks.

Run the offline checks without real credentials:

```sh
python3 scripts/host/one-command.test.py
python3 scripts/host/network-control-daemon.test.py
python3 scripts/host/network-install.test.py
python3 scripts/host/unified-install.test.py
node --test scripts/host/install.test.mjs scripts/host/bootstrap.test.mjs
```

The separate Rust AgentNet connector, browser authorization and its real enrollment gate are described in [headless enrollment](../../specs/tech_docs/headless_enrollment.md). It does not require Provider/model credentials to publish an empty device catalog. The Node package below retains local execution ownership; a root-configured `MYAGENTS_HOST_NETWORK_STATUS` path and `MYAGENTS_HOST_NETWORK_UID` may expose the Rust connector's bounded diagnostic report through `doctor`, without granting Node access to account or device secrets.

From the repository root, run `node scripts/host/build.mjs`. It cross-builds Linux x64/glibc bundles on macOS, downloads the pinned Node 24.20.0 and Claude SDK Linux x64 artifacts, and writes an unsigned test archive under `output/host/`. The package manifest records the closed profile, source commit/dirty flag, versions, resource pins, and each installed file's SHA-256, size, and mode. The `.sha256` sidecar detects transfer damage; it is not a publisher signature. A clean default build emits `install-<releaseId>.sh` pinned to the matching `host-test-<releaseId>` GitHub prerelease. To build the separate MoX test profile, use `MYAGENTS_HOST_PROFILE=moxbot-test node scripts/host/build.mjs`; it emits `moxbot-host-test-<releaseId>.tar.gz` and `install-moxbot-<releaseId>.sh`, pinned to `host-test-moxbot-<releaseId>`. Dirty builds still produce development archives but deliberately omit the bootstrap.

Only `myagents-test` (the default) and `moxbot-test` are accepted. `--profile` selects a fixed namespace; no root path or account override is supported. The MoX profile uses its own `moxbot-host-test` and `moxbot-host-network-test` accounts, units, `/opt`, `/var/lib`, `/etc`, `/run` paths, Host identity, provider master credential, and network identity credential. It does not reuse or migrate the MyAgents test identity. The single `/run/myagents-host-unified-install.lock` transaction lock still serializes installations of either profile. New archives carry an explicit profile marker; legacy archives without one are accepted only under the fixed `myagents-test` namespace and can never be installed as `moxbot-test`.

After the maintainer creates that exact prerelease and uploads the archive and generated bootstrap assets, use the maintainer-provided command to fetch the bootstrap by its numeric GitHub release asset ID with `Accept: application/octet-stream`; asset IDs exist only after upload. Do not guess an ID or use the browser download URL. Then run it with `sudo bash install-<releaseId>.sh`. The bootstrap requires root, Linux x86_64 with glibc, and the existing `curl`, `sha256sum`, `bash`, `tar`, `mktemp`, `getconf`, `flock`, and `python3` commands. It queries only the fixed `api.github.com/repos/heavenzhang/MyAgents/releases/tags/<pinned-tag>` endpoint, validates the exact tag, published state, pinned source commit, unique exact archive asset name, and positive integer asset ID, then downloads the archive through the fixed GitHub API asset endpoint with `Accept: application/octet-stream`. It never follows a metadata-provided URL and makes no raw-source request. The generated bootstrap embeds installer bytes from the pinned source commit; Python strictly decodes them into its private temporary directory and verifies their pinned SHA-256 before executing the installer. It also verifies the archive SHA-256 before installer execution and removes temporary files on exit. It does not configure networking or install desktop components. The bootstrap and package are unsigned internal test artifacts: embedded checksums detect mismatches but do not authenticate the publisher. Review the bootstrap from a trusted source before use; no matching release is implied to exist until the maintainer publishes it.

Install only after confirming the expected archive digest through a separate trusted channel. The installer requires the caller to provide the digest and validates the archive and manifest before extracting or running package code:

```sh
sudo scripts/host/install.sh output/host/myagents-host-test-<release>.tar.gz --sha256 <independently-confirmed-64-hex-digest> --profile myagents-test
# For a separately built MoX test archive:
sudo scripts/host/install.sh output/host/moxbot-host-test-<release>.tar.gz --sha256 <independently-confirmed-64-hex-digest> --profile moxbot-test
```

The paths, service account, unit, and socket are fixed by the selected profile. Repeating the same currently installed release is a verified no-op; a different release is refused while the service or Host lock is busy. Updates require an operator to inspect state and stop the service first. The installer waits for the service's Unix-socket `doctor` response with the expected Node version and SDK binary before it reports success. Automatic online updates and production signing are not implemented. Rollback passed isolated Ubuntu 24.04/systemd 255 checks for both profiles. The MoX unified transaction also passed real post-Node network rejection, rollback of the new unit/current/Wants state, verified same-archive retry, profile-pin repair, and same-release repeat without changing identity, encrypted credentials or the running Node PID.

On first installation, the installer creates a random 32-byte provider-store master key in memory, pipes it directly to `systemd-creds encrypt --name=provider-key --with-key=host`, and atomically publishes only the encrypted file at `/etc/myagents-host-test/credentials/provider-key.cred`. The service receives it through `LoadCredentialEncrypted=provider-key:…` as `CREDENTIALS_DIRECTORY/provider-key`; Node uses it only to encrypt provider credentials saved through the local product configuration flow. The master key is not a model credential. It is never written in plaintext to a file, argument, environment variable, or installer output. A valid existing file is reused without rotation; an unsafe file or failed encryption stops installation. Once published, the encrypted key is preserved across rollback and reinstall.

The unified installation and provider-key projection have passed isolated Linux checks. Owned remote management has also saved an encrypted synthetic provider credential through the actual production Controller and complete packaged Node Host, with original receipts restored after process restart. Actual desktop forms and real model execution remain acceptance gates; configure model credentials through the product form when that desktop path is accepted.

## Unified local Host + owned AgentNet test installation

`unified-install.py` installs the existing local Host package and the separately pinned AgentNet CI artifact as one root transaction. Supply both independently trusted SHA-256 values, the AgentNet source commit, and the owned service's HTTPS origin. The origin must have no credentials, path, query, or fragment. If the service uses a private test CA, pass a root-owned PEM file; the installer pins its bytes under `/etc/myagents-host-network-test/` and passes the CA to the Rust owner, which performs TLS verification. The owned profile is opt-in; the default network installer still emits the official-profile unit when `--owned-instance` is absent.

```sh
sudo python3 scripts/host/unified-install.py \
  --profile myagents-test \
  --host-archive output/host/myagents-host-test-<release>.tar.gz \
  --host-sha256 <independently-confirmed-host-sha256> \
  --network-artifact-dir /absolute/path/to/myagents-host-network-ci-artifact \
  --network-sha256 <independently-confirmed-network-binary-sha256> \
  --network-source-commit <40-hex-source-commit> \
  --owned-instance https://agentnet.example.test \
  --public-tls-ca-file /root/agentnet-test-ca.pem
```

For the separate MoX namespace, build and supply its matching archive and choose `--profile moxbot-test` on the unified command. This selects `/opt/moxbot-host-test`, `/var/lib/moxbot-host-test`, `/etc/moxbot-host-test`, `/run/moxbot-host-test`, unit `moxbot-host-test.service`, and the matching `moxbot-host-network-test` service/account. The profile is forwarded to both component installers and checked against the Host manifest. The unified transaction lock remains shared. Never run a MyAgents Host archive with the MoX profile or vice versa.

The unified command verifies both local artifacts into a private temporary snapshot and performs the Host installer's non-mutating archive check before changing the Host. Unified and standalone Host/network installers share one root-owned transaction lock. The unified installer passes its already-locked file descriptor to both child installers; they verify the descriptor refers to the fixed lock inode and reenter the same open-file-description lock. A concurrent installer from any entry point is rejected. On failure the unified command attempts to restore the prior Host `current` link and service unit, and reports rollback success only after checking the restored link, unit bytes, enabled state, and active state. The network installer preserves its own marker, encrypted credential, identity pin, and state rather than deleting them during a failed attempt. The installer does not start AgentNet, open a listener, sign in, create an owned account, or join a network. The network credential is reused as provisioned and is never rotated by this path.

After installation, use the root-only operator control to complete the chosen owned-instance login explicitly. `start` prints the authorization result to the invoking terminal through a transient systemd unit; it does not put the authorization URL in the journal. Then wait for authorization, and use `join` only when you intentionally want to enroll this Host. The connector must create the fixed management socket before the Node Host receives its IPC environment and restarts. `run` starts the owned connector without requesting a new join; `logout` stops it and revokes the owned session. These operations do not alter the existing default MyAgents Host installation.

```sh
sudo python3 scripts/host/network-control.py start
sudo python3 scripts/host/network-control.py wait
sudo python3 scripts/host/network-control.py join
# Later, to start without a new enrollment:
sudo python3 scripts/host/network-control.py run
# For the separately installed MoX test namespace, add:
sudo python3 scripts/host/network-control.py --profile moxbot-test start
# After the explicit login and join, keep the owned connector across reboots:
sudo python3 scripts/host/network-control.py --profile moxbot-test run --enable-on-boot
```

Boot activation is opt-in. `--enable-on-boot` accepts only an explicit owned `run` or `join`, checks that the fresh ready projection belongs to the provisioned Host and actual service PID, then enables the fixed connector unit. It does not request enrollment or renew any finite execution policy. Starting the owned management connection also adds a separate `network-status.conf` diagnostic drop-in, so `doctor` reports the actual connector state. Existing management drop-in bytes and native execution flags are preserved. Unknown status configuration is rejected; a failed check against an already-running connector does not stop that existing service.

The owned mode is still a test deployment. Separate real Linux two-device acceptance passed PKCE, explicit membership, signed TLS/Pairs, Node IPC, configuration/encrypted synthetic credential/disabled Agent writes, actual process restart and all three original receipts. Those checks used isolated QA state with the complete immutable packaged Host resource tree; the installed MoX identity/configuration was preserved. This proves native management, not the desktop user journey or model execution. See [current remote-management acceptance](../../specs/tech_docs/headless_remote_management.md). In default official mode, the runtime directory and replaceable status file use the Node Host's primary group, so the existing Host can read status without a supplementary group. With owned management IPC enabled, both use the network service's primary group (the setgid directory makes Rust's atomic status replacement inherit the matching GID); only the owned Host unit receives that group as a supplementary group, leaving its normal account groups unchanged. The network service's primary group also owns the management socket. Existing runtime directories with the prior non-setgid `0750` mode fail closed against the new `2750` ownership contract; migrate them only in a controlled maintenance window after stopping the affected services. The Node reverse IPC validates its provisioned socket path and permissions; the Rust connector is responsible for kernel peer-credential checks. Login, membership, and join remain explicit operator actions, and TLS/CA validation depends on the configured Rust owner.

Legacy Kimi projection remains supported for existing installations. New installs can include a pre-existing encrypted Kimi credential in the generated unit; for a running older installation, the historical manual procedure is:

```sh
sudo install -d -o root -g root -m 0700 /etc/myagents-host-test/credentials
sudo systemd-creds encrypt --name=kimi --with-key=host /root/kimi-api-key /etc/myagents-host-test/credentials/kimi.cred
sudo chown root:root /etc/myagents-host-test/credentials/kimi.cred
sudo chmod 0600 /etc/myagents-host-test/credentials/kimi.cred
```

Because the initial service was created without the credential file, add a systemd drop-in so systemd exposes it as `CREDENTIALS_DIRECTORY/kimi` on the next start:

```sh
sudo install -d -o root -g root -m 0755 /etc/systemd/system/myagents-host-test.service.d
sudo tee /etc/systemd/system/myagents-host-test.service.d/credentials.conf >/dev/null <<'UNIT'
[Service]
LoadCredentialEncrypted=kimi:/etc/myagents-host-test/credentials/kimi.cred
UNIT
sudo systemd-analyze verify /etc/systemd/system/myagents-host-test.service
sudo systemctl daemon-reload
sudo systemctl restart myagents-host-test
```

The Host resolves this legacy credential reference when it initializes a Session. Restarting the service after adding or replacing the encrypted file is required; changing the Host's persisted config alone does not load a new systemd credential. Do not put plaintext keys in the repository, service unit, or Host configuration. This remains a compatibility procedure, not the recommended path for new provider credentials.

The package does not enable Playwright/browser execution. Its bundled Node is self-contained; the installer and wrapper do not require system Node. Root installation, Linux runtime bootstrap, systemd readiness, busy-update refusal, identity/config persistence and failed-startup rollback have been checked on an isolated Ubuntu 24.04 host. The current provider-key installer passed real Linux `systemd-creds` host-key encryption/projection and rollback/reinstall checks. A synthetic credential with execution authorization disabled proved Session creation and persistence without model calls; separate complete-runtime native owned management also passed. Desktop remote forms and real model execution remain open acceptance gates. See `specs/tech_docs/linux_host.md`.

## Recoverable local configuration

The existing private Unix-socket `configure` command accepts an optional `mutationId` UUID in its stdin JSON. Include the original `expectedRevision` and complete allowed intent (`providerId`, `model`, optional absolute `workspace`, and explicit `executionAuthorized`). Save this ID before submitting. Read it later with `myagents-host receipt <mutationId>`; the CLI does not resend automatically.

For tracked requests, `hostSettings` and a non-secret receipt are committed together in the original `config.json`. The same ID and canonical request return the original receipt without increasing revision, including after restart, while a Session is active or after its workspace disappears. Reusing the ID with different intent or revision fails. UUIDs are case-insensitive; an omitted workspace is the explicit default workspace. The supplied absolute workspace spelling is part of the intent hash; filesystem aliases are not collapsed during replay. A tracked CAS conflict is a durable `conflict` receipt; legacy calls without an ID retain their conflict error behavior.

`persisted` with `effect: new-session` means the desired default was saved, not that a live Session changed or a model executed. Persistence errors are `unconfirmed`: query the original ID. `not-found` is a lookup result, not proof that an in-flight request was rejected. The ledger retains up to 256 entries without automatic expiry/eviction; a full ledger rejects new tracked requests while keeping existing receipts and legacy local configuration available. Malformed or wrong-Host ledgers fail closed. Do not discard unresolved receipts to clear capacity.

This local owner capability does not itself grant remote access. The owned management adapter verifies the authenticated caller, instance/network/principal/device and current target scope before dispatching the five fixed management methods to these existing owners. Official and legacy account adapters remain unavailable for remote Host management. The owned path passed real native integration; actual desktop forms and model execution remain separate gates.
