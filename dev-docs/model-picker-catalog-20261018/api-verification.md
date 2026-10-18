# Model catalog API verification

Task: `MODEL-PICKER-CATALOG-20261018`. Checked 2026-10-18, Asia/Shanghai (GET checks approximately 08:45–08:51). This record contains no credentials, account identifiers or private model configuration.

## Findings and changes

- OpenRouter's general `/api/v1/models` catalog is different from its account-filtered `/api/v1/models/user` catalog. The bundled provider now uses the latter with the configured bearer credential, without falling back to the general catalog after an empty response or an error.
- OpenCode Go's official catalog is `https://opencode.ai/inference/go/v1/models`. It is public and returns model IDs without execution-protocol metadata. Discovery sends an application User-Agent and never sends the configured Go API key. The catalog is separate from the protocol-specific inference URLs.
- Go inference defaults now match the official Endpoints table: Anthropic base `/inference/go/anthropic`; OpenAI base `/inference/go/openai/v1`. The existing resolver upgrades only exact legacy official `/zen/go` and `/zen/go/v1` base URLs in existing provider/session projections. It does not mutate their stored objects or replace custom URLs, model selections or explicit protocol choices.
- No new preset models were added. Discovery excludes the exact documented `gemini-4-argon-contributor` ID because its documented Google native endpoint has no adapter here. Unknown future IDs retain the existing explicit protocol setup flow; protocol support is not inferred from model names.
- OpenRouter's declared architecture video modality and supported reasoning parameters are now parsed.

## Official sources

- [OpenCode Go: Endpoints and Models](https://opencode.ai/v2/docs/console/go/#endpoints). The older [documentation URL](https://opencode.ai/docs/go/) redirects here. It also documents application identity and stable conversation headers for inference, changing catalogs, regional restrictions and usage limits.
- [OpenRouter: account-filtered model catalog](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails): filters provider preferences, privacy settings and guardrails; text output is the default.
- [OpenRouter: general model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties): model schema, architecture modalities and supported parameters.

## Actual read-only GET checks

Requests used Python `urllib.request` with a 20–25 second timeout. No inference request was sent to a supplier. No billable model call was made.

| Request | Authentication / identity | HTTP | Result |
| --- | --- | --- | --- |
| `https://openrouter.ai/api/v1/models/user` | Existing MoXBots configured bearer credential; application UA; JSON Accept | 200 | 468 models; `total_count=468`; no next page; all declare text output |
| `https://openrouter.ai/api/v1/models` | Same configured credential and headers | 200 | 471 models; `total_count=471`; no next page; all declare text output |
| `https://opencode.ai/inference/go/v1/models` | No credential; `User-Agent: MoXBots/0.5.10`; `Accept: application/json` | 200 | 37 model IDs; OpenAI-style `data[]`; rows have `id`, `object`, `created`, `owned_by`; no protocol metadata |
| `https://opencode.ai/zen/go/v1/models` | Same unauthenticated application headers | 200 | Same 37 model IDs as the official new Go catalog |
| Both Go directory URLs above | Python default HTTP client identity | 403 | Initial default-client requests rejected; adding an application UA and JSON Accept produced the successful requests above |

The authenticated OpenRouter results demonstrate that the general catalog included three additional IDs relative to this credential's filtered catalog at the time of testing. They do not establish that every filtered model has sufficient balance, quota, permissions for every operation, or a successful inference route. The 37 Go entries came from the official Go catalog, not the Zen general catalog; they are still a public service catalog, not account entitlement evidence. The raw upstream response and private credential were not persisted.

## Existing-install configuration/cache check

Read-only source tracing confirms `availableProvidersJson` does **not** retain or restore a `modelListUrl` for desktop model discovery:

1. `src/renderer/config/ConfigProvider.tsx::loadConfigDiskSnapshot` calls `getAllProviders(config)`.
2. `src/renderer/config/services/providerService.ts::getAllProviders` starts from the currently bundled `PRESET_PROVIDERS`, then loads separate custom providers. It does not deserialize `availableProvidersJson` into the preset catalog.
3. `src/shared/config-types.ts::mergePresetCustomModels` merges model additions/removals and metadata; it does not replace provider catalog URLs.
4. `src/renderer/hooks/useProviderModelDiscovery.ts` calls `fetchProviderModels` with that current provider; `resolveModelListUrl` uses its `modelListUrl`.
5. `src/shared/availableProvidersProjection.ts` defines the derived IM provider projection with identity, primary model, inference base URL, auth/protocol, credential and model labels. Its output has **no `modelListUrl` field**. Rebuilding it derives from the effective providers, rather than restoring old discovery URLs. Server `getAllEffectiveProviders` also starts with current presets; Host-imported explicit provider profiles are a separate configuration owner.

Therefore an existing desktop installation after loading this updated bundle and refreshing/relaunching configuration will use OpenRouter `/models/user`; an old `availableProvidersJson` cannot send discovery back to the general catalog. No cache migration or user configuration rewrite is necessary. A currently running older bundle remains older code until it is updated/reloaded. Explicit custom providers remain configured by their owners.

## Deterministic verification

The following commands ran from the task worktree using Node 24 and its existing dependency symlink. They do not use external inference or real credentials.

```sh
/opt/homebrew/opt/node@24/bin/node node_modules/vitest/vitest.mjs run --project unit src/renderer/config/services/modelDiscoveryService.test.ts src/renderer/config/services/modelDiscoveryService.tokendance.test.ts src/shared/provider-model-routing.test.ts src/shared/config-types.test.ts --project integration src/server/__tests__/opencode-go-routing.integration.test.ts src/server/__tests__/opencode-go-request.integration.test.ts

/opt/homebrew/opt/node@24/bin/node node_modules/vitest/vitest.mjs run --project unit src/server/__tests__/provider-verify.opencode-go.unit.test.ts

/opt/homebrew/opt/node@24/bin/node node_modules/eslint/bin/eslint.js src/renderer/config/services/modelDiscoveryService.ts src/renderer/config/services/modelDiscoveryService.test.ts src/renderer/config/services/modelDiscoveryService.tokendance.test.ts src/shared/opencode-go.ts src/shared/provider-model-routing.ts src/shared/provider-model-routing.test.ts src/shared/config-types.ts src/server/__tests__/opencode-go-routing.integration.test.ts --max-warnings=0

git diff --check
```

Results: **7 test files, 81 tests passed**. First test command: 6 files / 80 tests / 37.94 seconds. Second: 1 file / 1 test / 7.52 seconds. Targeted ESLint and whitespace checks passed. The outbound-identity integration test launches the actual SDK against a loopback fixture and captures its POST headers, including a preceding startup HEAD variant; it also verifies direct diagnostic and both OpenAI bridge formats use the same opaque stable session identity. This is local transport evidence, not supplier inference acceptance.

## Boundaries and remaining acceptance

- The Go account had no configured credential available for this check. Its public GET does not prove subscription, quota, region eligibility or model inference success.
- SDK/Bridge/direct-probe Go identity was verified through existing loopback tests. Integrated DSH uses a separate provider transport and was not validated by these tests; its main inference identity behavior remains unknown. Its Host web helper has an application UA but no observed Go-specific session header in the inspected source. Do not generalize SDK acceptance to DSH.
- Existing historical Go preset entries were preserved to avoid deleting user selections. Their known protocol mapping does not claim current catalog membership or account availability.
- Real native model-picker interaction, packaged desktop release, production installation, and real supplier inference remain separate acceptance steps owned by the coordinating task. No release or account mutation was performed by this API subtask.
- Runtime model and reasoning-effort metadata were not exposed; task total elapsed time was not measured. Only test durations above are measured.

## Custom provider follow-up

Primary-agent inspection of the screenshot and the relevant current MoXBots provider configuration established that the shown “Openrouter” is a custom provider at the official HTTPS `/api/v1` base, with no explicit catalog URL. Updating only the bundled provider would leave this route on the general directory. `resolveModelListUrl` now recognizes only OpenRouter's exact official HTTPS `/api` and `/api/v1` bases and infers `/api/v1/models/user`. Explicit `modelListUrl`, other hosts (including lookalikes), custom paths and query-bearing bases keep their existing behavior. The configured custom provider's own key is retained; no credential is borrowed from the bundled provider.

Primary-agent real read-only GET using this custom provider's existing credential returned HTTP200 / 468 entries on 2026-10-18 around 09:15 +08:00. The key, custom provider ID and raw private configuration were not recorded. Two discovery test files now pass 26 cases including three added custom-provider cases. Targeted ESLint also passed. This is an additional focused verification, overlapping the prior 81-case group rather than an independent additive total.
