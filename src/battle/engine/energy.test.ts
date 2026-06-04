import { describe, expect, it } from "vitest";
import type { BattleSide } from "../types";
import { energyRampEdits } from "./energy";

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

  it("emits SET_MAX_ENERGY before SET_CURRENT_ENERGY", () => {
    const edits = energyRampEdits("enemy", 3, MAX_CAP);
    const maxIdx = edits.findIndex((e) => e.kind === "SET_MAX_ENERGY");
    const curIdx = edits.findIndex((e) => e.kind === "SET_CURRENT_ENERGY");
    expect(maxIdx).toBeGreaterThanOrEqual(0);
    expect(curIdx).toBeGreaterThan(maxIdx);
  });

  it("emits equal value for both edits", () => {
    for (let turn = 1; turn <= 15; turn++) {
      const edits = energyRampEdits("player", turn, MAX_CAP);
      const maxEdit = edits.find((e) => e.kind === "SET_MAX_ENERGY");
      const curEdit = edits.find((e) => e.kind === "SET_CURRENT_ENERGY");
      expect(maxEdit).toBeDefined();
      expect(curEdit).toBeDefined();
      if (maxEdit && "value" in maxEdit && curEdit && "value" in curEdit) {
        expect(maxEdit.value).toEqual(curEdit.value);
      }
    }
  });

  it("value equals Math.min(turnNumber + 1, cap) for turns 1..15 with cap 10", () => {
    for (let turn = 1; turn <= 15; turn++) {
      const expected = Math.min(turn + 1, MAX_CAP);
      const edits = energyRampEdits("player", turn, MAX_CAP);
      const maxEdit = edits.find((e) => e.kind === "SET_MAX_ENERGY");
      const curEdit = edits.find((e) => e.kind === "SET_CURRENT_ENERGY");
      expect(maxEdit).toBeDefined();
      expect(curEdit).toBeDefined();
      if (maxEdit && "value" in maxEdit) {
        expect(maxEdit.value).toBe(expected);
      }
      if (curEdit && "value" in curEdit) {
        expect(curEdit.value).toBe(expected);
      }
    }
  });

  it("value never exceeds maxEnergyCap for turns 1..15", () => {
    for (let turn = 1; turn <= 15; turn++) {
      const edits = energyRampEdits("player", turn, MAX_CAP);
      for (const edit of edits) {
        if ("value" in edit) {
          expect(edit.value).toBeLessThanOrEqual(MAX_CAP);
        }
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

  it("respects a custom maxEnergyCap below the ramp value", () => {
    // With cap 3 and turn 5, turn+1=6 > cap, so value should be 3
    const edits = energyRampEdits("player", 5, 3);
    const maxEdit = edits.find((e) => e.kind === "SET_MAX_ENERGY");
    const curEdit = edits.find((e) => e.kind === "SET_CURRENT_ENERGY");
    expect(maxEdit).toBeDefined();
    expect(curEdit).toBeDefined();
    if (maxEdit && "value" in maxEdit) {
      expect(maxEdit.value).toBe(3);
    }
    if (curEdit && "value" in curEdit) {
      expect(curEdit.value).toBe(3);
    }
  });
});
