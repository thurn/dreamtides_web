import { describe, expect, it } from "vitest";
import type { MobileBattleInspectorAction } from "../../cumulus/screens/MobileBattleScreen";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../test-support";
import type { BattleMutableState, BattleSideMutableState } from "../types";
import { resolveBattleInspectorIntent } from "./battle-inspector-intents";

function side(deck: string[], hand: string[]): BattleSideMutableState {
  return { currentEnergy: 2, maxEnergy: 4, score: 3, visibility: {}, deck, hand, void: [], banished: [], backRank: emptyBackRankSlots(), frontRank: emptyFrontRankSlots(), fatigueCount: 0, dreamwellCardIndex: null, dreamwellDrawnTurn: null };
}

function state(): BattleMutableState {
  return { battleId: "battle-inspector-fixture", activeSide: "player", turnNumber: 2, phase: "day", result: null, forcedResult: null, dreamwellDeckIndex: 0, nextBattleCardOrdinal: 4, stack: [], cardInstances: {}, sides: { player: side(["p-deck-a", "p-deck-b"], ["p-hand"]), enemy: side(["e-deck-a", "e-deck-b"], ["e-hand"]) } };
}

describe("resolveBattleInspectorIntent", () => {
  it.each([
    [{ kind: "draw", side: "enemy" }, "DRAW_CARD"],
    [{ kind: "discard", side: "enemy" }, "DISCARD_CARD"],
    [{ kind: "erode", side: "enemy", count: 3 }, "ERODE"],
    [{ kind: "adjust-stat", side: "enemy", stat: "points", amount: 1 }, "ADJUST_SCORE"],
    [{ kind: "skip-to-rewards" }, "SKIP_TO_REWARDS"],
    [{ kind: "force-result", result: "defeat" }, "FORCE_RESULT"],
  ] as const)("maps %o to an inspector-sourced command", (action, expected) => {
    const resolution = resolveBattleInspectorIntent(action as MobileBattleInspectorAction, state());
    expect(resolution.kind).toBe("command");
    if (resolution.kind !== "command") return;
    expect(resolution.command.sourceSurface).toBe("inspector");
    expect(resolution.command.id === "DEBUG_EDIT" ? resolution.command.edit.kind : resolution.command.id).toBe(expected);
  });

  it("orders the combined energy gesture safely and shuffles instance ids", () => {
    const increase = resolveBattleInspectorIntent({ kind: "adjust-energy-pair", side: "player", amount: 1 }, state());
    expect(increase).toMatchObject({ kind: "gesture", commands: [{ edit: { kind: "SET_MAX_ENERGY" } }, { edit: { kind: "SET_CURRENT_ENERGY" } }] });
    const shuffle = resolveBattleInspectorIntent({ kind: "shuffle", side: "player" }, state(), () => 0);
    expect(shuffle).toMatchObject({ kind: "command", command: { sourceSurface: "inspector", edit: { kind: "REORDER_DECK", order: ["p-deck-b", "p-deck-a"] } } });
  });

  it.each([
    [{ kind: "foresee", side: "player" }, "foresee"],
    [{ kind: "open-deck", side: "enemy" }, "open-deck"],
    [{ kind: "dreamwell-draw", side: "player" }, "dreamwell-draw"],
    [{ kind: "create-figment", side: "enemy" }, "create-figment"],
    [{ kind: "open-pool-viewer" }, "pool-viewer"],
  ] as const)("maps %o to the expected accessory", (action, accessory) => {
    expect(resolveBattleInspectorIntent(action as MobileBattleInspectorAction, state())).toMatchObject({ kind: "accessory", accessory });
  });
});
