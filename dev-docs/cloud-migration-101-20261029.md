# MoXBots fresh test cloud on101

Task: MOXBOTS-CLOUD-MIGRATION-101-20261029. Canonical repository: https://github.com/heavenzhang/MoXBots.git. The human explicitly authorizes a fresh test cloud because old140 data was test-only. Do not import unknown databases or impersonate the old trust domain. Keep the old disk untouched and original101 Host device files/keys/config intact.

## Deployment boundaries

The existing101 Nginx80/443 also serves Mox for Science. Preserve its root, `/admin`, `/download`, `/desktop-connect`, `/assets/`, `/api/v1/`, existing downloads/demo/presentations and its Docker app/database. Reuse the existing valid IP-SAN TLS certificate and renewal process. MoXBots service and Dex bind only loopback18081/15556; no new public listeners.

| Component | New public path | Owner |
| --- | --- | --- |
| Website/downloads | `https://101.42.11.29/moxbots/`, `/moxbots/download/` |01a12b99 |
| Admin | `/moxbots/admin` |01a12b99 |
| OIDC and account | `/dex/`, `/auth/` |01a12b99 |
| Identity/network/relay | `/api/agent-network/`, `/v1/` |01a12b99 |
| Admin API | `/api/admin/` |01a12b99 |
| Community/feedback | existing service paths `/community`, `/api/community/`, `/feedback`, `/api/feedback/` |01a12b99 |
| Updater | `/updates/` |01a12bc2 |
| Mobile | new immutable build using101 |01a12b99 |
| Desktop and combined CI/main | new immutable version using101 |01a12bc2 |

New data root: `/var/lib/moxbots-cloud101`; static root: `/srv/moxbots-cloud101`. Create a dedicated runtime user and private directories. Use the service's existing `--initialize-identity-keys` command once for a new cloud authority; never overwrite existing keys. Store fresh credentials outside Git in owner-only files. Keep original updater signing material: cloud identity keys and updater keys have different responsibilities.

## Source behavior

`/moxbots/admin` uses the same service/admin authorization owner and assets as `/admin`, with fixed asset references. The callback destination is a closed allowlist entry stored with original OAuth state. Callback query data cannot choose it. Original `/admin` still works when that route is owned by MoXBots on other installations. Shared101 ingress forwards only the alternative mount.

`bootstrap_auth.py --native-password` explicitly enables Dex's existing local-password connector for the confidential Rust service client. Defaults remain unchanged; consent, strict password validation, owner-only output, insert-only initialization and loopback publication remain enforced. No public OAuth client secret is exposed.

## Safe sequence and rollback

1. Verify no competing publication; capture exact config hashes, protected route baselines, existing processes and container identities. Acquire nonblocking shared maintenance ownership. If occupied, wait; never force or kill.
2. Pin reviewed source and Linux artifact provenance; prepare private Dex/service configuration and new account. Stage under a new immutable release directory. Back up touched files privately before any change.
3. Start only new Dex on loopback. Add explicit Dex HTTPS ingress via an additive include and configuration-hash CAS. Run `nginx -t` before reload. Start new service only after discovery succeeds with normal TLS.
4. Verify native and browser login using controlled fresh account, exact device/session binding, new public descriptor and authorization. Assign admin only to the actual principal returned by the existing auth owner. Keep private tokens out of logs.
5. Add only ready cloud/static routes. Run protected unrelated-route and TLS regression. On failure, restore only files still owned by this release and whose hashes match expected deployed bytes; reload Nginx only after validation. Stop/remove only new release units if needed. Never roll back live databases or original101 Host state.
6. New desktop/mobile artifacts must embed101. Old installed artifacts still embed140 and cannot be fixed by merely copying files. Do not overwrite published versions/tags. Keep new origin/trust acceptance explicit and reuse supported device-key owners.
7. Complete full anonymous artifact size/SHA/archive/signature checks, actual phone/account/Host paths, remote main inclusion and final receipt. TestFlight processing/review/invitation remains separate from local installation.

## Validation checkpoint

Service Rust tests:212 passed,0 failed,8 ignored. Bootstrap tests:6 passed. `cargo clippy --locked --all-targets -- -D warnings`, rustfmt, admin JS syntax and diff checks passed. Fixed mount/state/security regression is included. Existing real-Dex workflow must validate the exact new source and produce Linux binary provenance before publication.

At this checkpoint only the official Dex2.46 image has been pulled on101. No cloud/static route, old Host configuration, daily Mac client or running unrelated service has been changed. Production, immutable packages, phone paths and main delivery remain pending.

## WebSocket proxy header invariant

Ubuntu's `/etc/nginx/proxy_params` already supplies `X-Forwarded-Proto $scheme`. Do not also set that header in `/v1/`: the relay rejects any duplicate header before authentication. The101 TLS location retains the existing include and these upgrade directives:

```nginx
include /etc/nginx/proxy_params;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;
```

A valid anonymous HTTP/1.1 WebSocket handshake with subprotocol `myagents-agent-network.v1` must reach the authentication preflight401;400 is not readiness. Then verify an actual authenticated WSS/Node Ready path. The2026-10-29 one-header correction and11-route regression are recorded in the companion acceptance document. Retain the shared maintenance locks, exact latest snippet SHA CAS, backup and ownership-checked rollback; do not rerun historical deployment scripts against the current snippet.
