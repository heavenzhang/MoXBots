export type ModelFailoverMode = 'auto' | 'specified' | 'off';

export interface ModelFailoverSettings {
  /** Legacy projection: true only for an explicitly configured backup. */
  enabled: boolean;
  /** Absent retains legacy behavior: enabled => specified, otherwise auto. */
  mode?: ModelFailoverMode;
  /** Cross-tier backup selection is opt-in, including configured backups. */
  allowCrossTier?: boolean;
  /** The selected conversation model remains primary. No credentials here. */
  backup?: { providerId: string; modelId: string };
}

/** Normalize legacy settings without writing or migrating config.json. */
export function modelFailoverMode(value: ModelFailoverSettings | undefined): ModelFailoverMode {
  if (value?.mode === 'auto' || value?.mode === 'specified' || value?.mode === 'off') return value.mode;
  return value?.enabled === true ? 'specified' : 'auto';
}

export type ConfiguredBackupStatus = 'not-configured' | 'provider-unavailable' | 'model-unavailable' | 'missing-key' | 'missing-endpoint' | 'ready';

/** Configuration readiness only; actual Session/history/content is checked by the runtime. */
export function configuredBackupStatus(
  value: ModelFailoverSettings | undefined,
  providers: readonly { id: string; name?: string; type?: unknown; execution?: unknown; enabled?: unknown;
    config?: { baseUrl?: string }; models?: readonly { model: string; modelName?: string }[] }[],
  apiKeys: Readonly<Record<string, string>>,
): { status: ConfiguredBackupStatus; label?: string } {
  const ref = value?.backup;
  if (!ref?.providerId || !ref.modelId) return { status: 'not-configured' };
  const provider = providers.find(row => row.id === ref.providerId);
  if (!provider || !isModelFailoverProvider(provider)) return { status: 'provider-unavailable' };
  const model = provider.models?.find(row => row.model === ref.modelId);
  if (!model) return { status: 'model-unavailable' };
  const label = `${provider.name ?? provider.id} · ${model.modelName ?? model.model}`;
  if (!apiKeys[provider.id]?.trim()) return { status: 'missing-key', label };
  if (!provider.config?.baseUrl?.trim()) return { status: 'missing-endpoint', label };
  return { status: 'ready', label };
}

/** Native subscription/runtime credentials cannot be borrowed by an API bridge. */
export function isModelFailoverProvider(provider: { id: string; type?: unknown; execution?: unknown; enabled?: unknown }): boolean {
  const execution = provider.execution;
  return provider.type === 'api' && provider.enabled !== false
    && (!execution || (typeof execution === 'object' && 'kind' in execution && execution.kind === 'builtin'))
    && !provider.id.startsWith('cloud-session:');
}

/** Fail over on availability failures only, never auth, billing or bad input. */
export function isModelFailoverStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502
    || status === 503 || status === 504 || status === 529;
}
