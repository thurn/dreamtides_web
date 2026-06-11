import { describe, expect, it } from "vitest";
import { dreamwellEnergyEdits } from "./energy";

describe("dreamwellEnergyEdits", () => {
  it("raises maximum ● by energyAdded and refills current ● to the new maximum", () => {
    expect(dreamwellEnergyEdits("player", 3, 2)).toEqual([
      { kind: "SET_MAX_ENERGY", side: "player", value: 5 },
      { kind: "SET_CURRENT_ENERGY", side: "player", value: 5 },
    ]);
  });

  it("is uncapped — the sum may exceed the per-turn cap", () => {
    const [setMax] = dreamwellEnergyEdits("enemy", 10, 2);
    expect(setMax).toEqual({ kind: "SET_MAX_ENERGY", side: "enemy", value: 12 });
  });

  it("refills current ● without raising the maximum for a 0-energy card", () => {
    expect(dreamwellEnergyEdits("player", 4, 0)).toEqual([
      { kind: "SET_MAX_ENERGY", side: "player", value: 4 },
      { kind: "SET_CURRENT_ENERGY", side: "player", value: 4 },
    ]);
  });

  it("sets the maximum before the current so the current ≤ max invariant holds", () => {
    const [first, second] = dreamwellEnergyEdits("player", 2, 1);
    expect(first.kind).toBe("SET_MAX_ENERGY");
    expect(second.kind).toBe("SET_CURRENT_ENERGY");
  });
});
