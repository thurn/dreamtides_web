import { describe, expect, it } from "vitest";
import type { BattleCommand } from "./debug/commands";
import { automaticBattleIntentKey } from "./automatic-intent-key";
import { parseBattleId } from "../types/identifiers";

const state = { activeSide: "player" as const, turnNumber: 2 };

describe("automaticBattleIntentKey", () => {
  it("identifies the mandatory Dreamwell reveal by battle, side, and turn", () => {
    const command: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "DRAW_DREAMWELL_CARD", side: "player", turnNumber: 2 },
      sourceSurface: "auto-system",
    };

    expect(
      automaticBattleIntentKey(parseBattleId("battle-7"), state, command),
    ).toBe("battle:battle-7:dreamwell:player:2");
  });

  it("leaves deliberate additional Dreamwell draws as separate player intents", () => {
    const command: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "DRAW_DREAMWELL_CARD",
        side: "player",
        turnNumber: 2,
        additional: true,
      },
      sourceSurface: "status-strip",
    };

    expect(
      automaticBattleIntentKey(parseBattleId("battle-7"), state, command),
    ).toBeUndefined();
  });

  it("identifies automatic phase advancement without coalescing phase controls", () => {
    const automatic: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "day" },
      sourceSurface: "auto-system",
    };
    const manual: BattleCommand = {
      ...automatic,
      sourceSurface: "phase-controls",
    };

    expect(
      automaticBattleIntentKey(parseBattleId("battle-7"), state, automatic),
    ).toBe("battle:battle-7:auto-phase:player:2:day");
    expect(
      automaticBattleIntentKey(parseBattleId("battle-7"), state, manual),
    ).toBeUndefined();
  });
});
