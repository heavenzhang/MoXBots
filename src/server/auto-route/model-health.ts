import type { UpstreamConfig } from "../openai-bridge/types/bridge";

const COOLDOWN_MS = 30_000;
const MAX_ROUTES = 256;
type Observation = {
  observedAt: number;
  outcome: "success" | "failure";
  cooldownUntil: number;
};
const observations = new Map<string, Observation>();

/** Endpoint identity, never model name or credentials. No probes or persisted state. */
export function modelFailureDomain(
  target: Pick<UpstreamConfig, "baseUrl">,
): string {
  try {
    const url = new URL(target.baseUrl);
    return url.origin.toLowerCase();
  } catch {
    return target.baseUrl;
  }
}
export function observeModelHealth(
  target: Pick<UpstreamConfig, "baseUrl">,
  outcome: "success" | "failure",
  now = Date.now(),
): void {
  const key = modelFailureDomain(target);
  observations.delete(key);
  observations.set(key, {
    observedAt: now,
    outcome,
    cooldownUntil: outcome === "failure" ? now + COOLDOWN_MS : 0,
  });
  while (observations.size > MAX_ROUTES)
    observations.delete(observations.keys().next().value!);
}
export function getModelHealth(
  target: Pick<UpstreamConfig, "baseUrl">,
  now = Date.now(),
): (Readonly<Observation> & { coolingDown: boolean }) | undefined {
  const row = observations.get(modelFailureDomain(target));
  return row && { ...row, coolingDown: row.cooldownUntil > now };
}
