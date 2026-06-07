import { describe, expect, it } from "vitest";
import type { BattleSide } from "../types";
import {
  energyRampEdits,
  OPENING_ENERGY,
  STANDARD_ENERGY_RAMP,
  type EnergyRampSchedule,
} from "./energy";

/** Reads the equal `value` shared by the SET_MAX/SET_CURRENT pair. */
function rampValue(
  side: BattleSide,
  turnNumber: number,
  maxEnergyCap: number,
  schedule?: EnergyRampSchedule,
): number {
  const edits = energyRampEdits(side, turnNumber, maxEnergyCap, schedule);
  const maxEdit = edits.find((e) => e.kind === "SET_MAX_ENERGY");
  const curEdit = edits.find((e) => e.kind === "SET_CURRENT_ENERGY");
  if (!maxEdit || !("value" in maxEdit) || !curEdit || !("value" in curEdit)) {
    throw new Error("expected SET_MAX_ENERGY and SET_CURRENT_ENERGY edits");
  }
  expect(maxEdit.value).toBe(curEdit.value);
  return maxEdit.value;
}

describe("energyRampEdits", () => {
  const MAX_CAP = 10;

  it("emits exactly one SET_MAX_ENERGY and one SET_CURRENT_ENERGY edit for the given side", () => {
    const edits = energyRampEdits("player", 1, MAX_CAP);
    const maxEnergyEdits = edits.filter((e) => e.kind === "SET_MAX_ENERGY");
    const currentEnergyEdits = edits.filter((e) => e.kind === "SET_CURRENT_ENERGY");
    expect(maxEnergyEdits).toHaveLength(1);
    expect(currentEnergyEdits).toHaveLength(1);
    expect(maxEnergyEdits[0]).toMatchObject({ kind: "SET_MAX_ENERGY", side: "player" });
    expect(currentEnergyEdits[0]).toMatchObject({ kind: "SET_CURRENT_ENERGY", side: "player" });
  });

  // Invariant: SET_MAX_ENERGY must precede SET_CURRENT_ENERGY so applying the
  // edits in order can never transiently put current above max.
  it("emits SET_MAX_ENERGY before SET_CURRENT_ENERGY", () => {
    for (let turn = 1; turn <= 15; turn++) {
      const edits = energyRampEdits("enemy", turn, MAX_CAP);
      const maxIdx = edits.findIndex((e) => e.kind === "SET_MAX_ENERGY");
      const curIdx = edits.findIndex((e) => e.kind === "SET_CURRENT_ENERGY");
      expect(maxIdx).toBeGreaterThanOrEqual(0);
      expect(curIdx).toBeGreaterThan(maxIdx);
    }
  });

  // Invariant: both edits carry the same value, so current is set equal to max.
  it("emits equal value for both edits", () => {
    for (let turn = 1; turn <= 15; turn++) {
      // rampValue asserts the two values are equal internally.
      rampValue("player", turn, MAX_CAP);
    }
  });

  // Invariant: turn 1 yields exactly the opening value (off-by-one guard).
  it("yields the opening value on turn 1", () => {
    expect(rampValue("player", 1, MAX_CAP)).toBe(OPENING_ENERGY);
    expect(rampValue("enemy", 1, MAX_CAP)).toBe(OPENING_ENERGY);
  });

  // Invariant: the schedule never decreases as the turn number grows.
  it("is non-decreasing in turnNumber", () => {
    let prev = -Infinity;
    for (let turn = 1; turn <= 30; turn++) {
      const value = rampValue("player", turn, MAX_CAP);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  // Invariant: the value never exceeds the cap (current ≤ max ≤ cap).
  it("value never exceeds maxEnergyCap", () => {
    for (const cap of [1, 3, 5, 10]) {
      for (let turn = 1; turn <= 30; turn++) {
        expect(rampValue("player", turn, cap)).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("works for both sides", () => {
    const sides: BattleSide[] = ["player", "enemy"];
    for (const side of sides) {
      const edits = energyRampEdits(side, 5, MAX_CAP);
      for (const edit of edits) {
        if ("side" in edit) {
          expect(edit.side).toBe(side);
        }
      }
    }
  });

  it("clamps to a custom maxEnergyCap below the ramp value", () => {
    // Cap 3 with a turn far past the cap: the value saturates at the cap.
    expect(rampValue("player", 5, 3)).toBe(3);
  });
});

describe("STANDARD_ENERGY_RAMP schedule", () => {
  it("exposes the opening value as the constant", () => {
    expect(STANDARD_ENERGY_RAMP.openingValue).toBe(OPENING_ENERGY);
    expect(STANDARD_ENERGY_RAMP.target(1, 10)).toBe(OPENING_ENERGY);
  });

  it("ramps by one per turn until clamped", () => {
    expect(STANDARD_ENERGY_RAMP.target(2, 10)).toBe(OPENING_ENERGY + 1);
    expect(STANDARD_ENERGY_RAMP.target(3, 10)).toBe(OPENING_ENERGY + 2);
  });
});

describe("configurable ramp schedule", () => {
  // A steeper alternate schedule proves the ramp is swappable while still
  // honouring the same invariants the engine relies on.
  const STEEP: EnergyRampSchedule = {
    openingValue: 3,
    target(turnNumber: number, maxEnergyCap: number): number {
      return Math.min(3 + (turnNumber - 1) * 2, maxEnergyCap);
    },
  };

  it("uses the provided schedule's opening value on turn 1", () => {
    expect(rampValue("player", 1, 100, STEEP)).toBe(STEEP.openingValue);
  });

  it("honours the invariants for an alternate schedule", () => {
    let prev = -Infinity;
    for (let turn = 1; turn <= 20; turn++) {
      const value = rampValue("player", turn, 100, STEEP);
      expect(value).toBeGreaterThanOrEqual(prev);
      expect(value).toBeLessThanOrEqual(100);
      prev = value;
    }
  });

  it("still clamps an alternate schedule to the cap", () => {
    expect(rampValue("player", 50, 7, STEEP)).toBe(7);
  });

  it("defaults to the standard ramp when no schedule is supplied", () => {
    for (let turn = 1; turn <= 15; turn++) {
      expect(rampValue("player", turn, 10)).toBe(
        STANDARD_ENERGY_RAMP.target(turn, 10),
      );
    }
  });
});
