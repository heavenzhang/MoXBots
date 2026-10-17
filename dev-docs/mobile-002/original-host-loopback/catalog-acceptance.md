# Initial original Host catalog

Scope: initial publication from the original Node identity/config/projects owner
through the existing protected Unix IPC to the headless connector. This is a
successor on the already start-gated branch; canonical base remains
`9269dd8c52c423a180bfba366c8f0434a90db005`, owned-diff base is
`26108f966f1c18828a8c8dbaca647acabe48e795`. Parent root b217 implementation and
later main wiring are integration dependencies, not this package's owned work.

## Behavior and boundaries

The new read-only owner uses strict original config/projects readers and pure
`resolveAgentWorkspaceProjections` under the original intent lock. Diagnostics,
partial ownership, malformed/missing sources, duplicates and root verification
failure reject the entire read. Only enabled ordinary, visible, active, builtin
Agents enter the catalog. Private delegated Bots and unsupported runtimes are
excluded. No registration repair or Session execution occurs.

The frozen CatalogItem's existing required `path` is preserved solely in the
original private IPC and service catalog flow. The query accepts no caller path,
credential, item, epoch or sequence. Mobile JS targets must retain their existing
projection without this path. Catalog visibility grants no invoke authorization.

`catalog.snapshot` accepts only an optional cursor (at most128 characters).
Responses contain exactly kind=`catalog.chunk`, observation, offset, dataBase64,
nextCursor. Raw chunks are at most24KiB, with canonical base64 and a complete
serialized-items SHA256. The Node owner retains one bounded snapshot, exact local
authority and fixed30s lifetime. It reads the real source initially and again at
EOF; source drift rejects the entire result. EOF bytes remain retryable until
expiry without another source read. No persistent registry/cache is introduced.

Native enforces the30s whole-read deadline, exact contiguous offsets and cursor,
observation/hash equality, bounded chunk count, original8MiB/catalogItems budgets,
duplicate identities/paths and the original full CatalogSnapshot validator. It
assigns its own connection epoch and sequence1. Current identity/account/binding
are checked before and after each IPC call and after upload. Managed failures
prevent Ready; only the existing explicitly unmanaged configuration stays empty.
This does not implement dynamic registry refresh.

## Local verification

Run from the task worktree; no credentials or external provider are needed:

```sh
node_modules/.bin/eslint src/host/mobile-agent-catalog.ts src/host/management-ipc.ts src/server/host-mobile-agent-catalog.integration.test.ts
node_modules/.bin/vitest run --project integration src/server/host-mobile-agent-catalog.integration.test.ts
node_modules/.bin/tsc --noEmit --pretty false
DEVELOPER_DIR=/Library/Developer/CommandLineTools CARGO_TARGET_DIR="$PWD/src-tauri/headless-network/target" cargo test --manifest-path src-tauri/headless-network/Cargo.toml --locked --lib
```

Results: Node6 passed (121ms test,751ms total); root tsc/eslint exit0; native190
passed,0 failed,1 ignored (191 cases,2.56s test,10.23s compile). Native includes an
actual original Unix IPC catalog query plus parser/budget tests; these are not an
actual combined Node-main/service/WSS catalog acceptance.

The initial Node test fixture failed because macOS `/var` resolves to
`/private/var`; canonicalizing the private temporary fixture root fixed it without
relaxing the production root guard. The first vitest command used nonexistent
project `server`; the recorded command above uses the actual `integration` project.
Fixtures use private temporary HOME/workspaces and remove only their own files.
No fixture token, key or database is committed.

Strict clippy (`cargo clippy` with the same manifest/target, `--locked --lib
--tests -- -D warnings`) remains red on two unchanged preexisting argument-count
warnings: `raw_request_with_limits` in owned_login.rs and
`handle_management_events` in connector.rs. Both signatures were verified in the
owned-diff base. No suppression or unrelated production refactor was added.

## Parent integration

Root owns main.ts. Import/create `createHostMobileAgentCatalog({workspacePath})`;
after the original local-source device/stop validation, dispatch
`operation.kind === 'catalog.snapshot'` to
`mobileCatalog.request(authority, operation.cursor)`. Keep original authority
before/after verification. The parent must independently run the actual original
Host/private IPC/headless/service targets chain; it has not been claimed by these
local tests. Production dual-UID, real account/WSS/device, dynamic changes,
provider, phone and deployment acceptance remain outside this package.

No new dependencies, lock changes, frozen schema changes or further agents.
Requested model6.1-sol/medium; actual serving model, token usage and cost unknown.

## Follow-up: persisted type evidence

Review of the actual `admin-config.ts` strict loader confirms
`validIdentityRows` already requires Agent `name` to be a string and `enabled`
to be a boolean; otherwise `loadConfig({strict:true})` throws `REGISTRY_CORRUPT`.
Thus the prior String(name)/truthiness expressions were not reachable with
malformed persisted types. The catalog now projects `name` directly and selects
only `enabled === true`, removing unnecessary coercion without changing the
registry owner or filling defaults.

A real temporary-registry regression writes12 malformed name/enabled variants
(including omitted/null/object/array/numeric values, truthy string enabled and
invalid name on a disabled Agent). All reject with the original fixed corruption
error, never call the workspace verifier, and leave config/projects bytes intact;
restoring a valid row then succeeds through the same catalog owner. Final focused
suite:7 passed,139ms test/803ms total; eslint and root tsc exit0. No production
defect red was fabricated: the existing strict owner already rejected these rows.
Only helper/test/documentation/task record changed in this follow-up.
