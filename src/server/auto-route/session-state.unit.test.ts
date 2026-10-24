import { describe, expect, it } from "vitest";
import {
  getAutoRouteCandidates,
  setAutoRouteSessionState,
} from "./session-state";

describe("admitted recovery plan", () => {
  it("binds candidates to the primary and caps snapshots without lending mutable state", () => {
    setAutoRouteSessionState("candidate-test", {
      primary: { providerId: "p", model: "p" },
      candidates: ["b", "c", "d", "e"].map((modelId) => ({
        providerId: modelId,
        modelId,
      })),
    });
    expect(
      getAutoRouteCandidates("candidate-test", {
        providerId: "p",
        model: "different",
      }),
    ).toEqual([]);
    const snapshot = getAutoRouteCandidates("candidate-test", {
      providerId: "p",
      model: "p",
    });
    expect(snapshot).toHaveLength(3);
    snapshot[0].modelId = "mutated";
    expect(getAutoRouteCandidates("candidate-test")[0].modelId).toBe("b");
    setAutoRouteSessionState("candidate-test", undefined);
    expect(getAutoRouteCandidates("candidate-test")).toEqual([]);
  });
  it("supports the existing singular backup admission contract", () => {
    setAutoRouteSessionState("legacy-candidate-test", {
      backup: { providerId: "b", modelId: "b" },
    });
    expect(getAutoRouteCandidates("legacy-candidate-test")).toEqual([
      { providerId: "b", modelId: "b" },
    ]);
    setAutoRouteSessionState("legacy-candidate-test", undefined);
  });
});
