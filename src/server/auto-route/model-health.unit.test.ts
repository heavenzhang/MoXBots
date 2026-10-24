import { describe, expect, it } from "vitest";
import {
  getModelHealth,
  modelFailureDomain,
  observeModelHealth,
} from "./model-health";

describe("observed endpoint health", () => {
  it("keeps unknown configuration distinct from actual results and uses finite cooldown", () => {
    const target = { baseUrl: "https://health-fixture.test/v1/" };
    expect(getModelHealth(target, 0)).toBeUndefined();
    observeModelHealth(target, "failure", 100);
    expect(getModelHealth(target, 101)).toMatchObject({
      outcome: "failure",
      coolingDown: true,
    });
    expect(getModelHealth(target, 30_100)).toMatchObject({
      coolingDown: false,
    });
    observeModelHealth(target, "success", 200);
    expect(getModelHealth(target, 201)).toMatchObject({
      outcome: "success",
      coolingDown: false,
    });
  });
  it("groups models on the same endpoint without credentials and distinguishes endpoints", () => {
    expect(modelFailureDomain({ baseUrl: "https://GATEWAY.test/v1/" })).toBe(
      modelFailureDomain({ baseUrl: "https://gateway.test/v1" }),
    );
    expect(
      modelFailureDomain({
        baseUrl: "https://gateway.test/provider-a/messages",
      }),
    ).toBe(
      modelFailureDomain({
        baseUrl: "https://gateway.test/provider-b/responses",
      }),
    );
    expect(
      modelFailureDomain({ baseUrl: "https://gateway.test:8443/v1" }),
    ).not.toBe(modelFailureDomain({ baseUrl: "https://gateway.test/v1" }));
    expect(modelFailureDomain({ baseUrl: "https://other.test/v1" })).not.toBe(
      modelFailureDomain({ baseUrl: "https://gateway.test/v1" }),
    );
  });
});
