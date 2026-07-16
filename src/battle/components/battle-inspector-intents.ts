import type { MobileBattleInspectorAction } from "../../cumulus/screens/MobileBattleScreen";
import type { BattleCommand } from "../debug/commands";
import type { BattleMutableState, BattleSide, BrowseableZone } from "../types";
import { createDiscardMostRecentHandCardCommand } from "./battle-ui-commands";

export type BattleInspectorIntentResolution =
  | { readonly kind: "command"; readonly command: BattleCommand }
  | { readonly kind: "gesture"; readonly commands: readonly BattleCommand[] }
  | { readonly kind: "accessory"; readonly accessory: "foresee" | "open-zone" | "dreamwell-draw" | "create-figment" | "pool-viewer" | "battle-log" | "dreamwell-history"; readonly side?: BattleSide; readonly zone?: Exclude<BrowseableZone, "hand"> }
  | { readonly kind: "presentation"; readonly action: "opened" | "side-selected" | "toggle-opponent-hand" | "toggle-player-hand" | "reset-battle" }
  | { readonly kind: "none" };

/** Resolves a Cumulus inspector intent without mutating battle or UI state. */
export function resolveBattleInspectorIntent(
  action: MobileBattleInspectorAction,
  state: BattleMutableState,
  random: () => number = Math.random,
): BattleInspectorIntentResolution {
  if (action.kind === "opened" || action.kind === "side-selected" || action.kind === "toggle-opponent-hand" || action.kind === "toggle-player-hand" || action.kind === "reset-battle") {
    return { kind: "presentation", action: action.kind };
  }
  if (action.kind === "adjust-stat") {
    const kind = action.stat === "points" ? "ADJUST_SCORE" : action.stat === "currentEnergy" ? "ADJUST_CURRENT_ENERGY" : "ADJUST_MAX_ENERGY";
    return { kind: "command", command: { id: "DEBUG_EDIT", edit: { kind, side: action.side, amount: action.amount }, sourceSurface: "inspector" } };
  }
  if (action.kind === "adjust-energy-pair") {
    const side = state.sides[action.side];
    const current: BattleCommand = { id: "DEBUG_EDIT", edit: { kind: "SET_CURRENT_ENERGY", side: action.side, value: side.currentEnergy + action.amount }, sourceSurface: "inspector" };
    const maximum: BattleCommand = { id: "DEBUG_EDIT", edit: { kind: "SET_MAX_ENERGY", side: action.side, value: side.maxEnergy + action.amount }, sourceSurface: "inspector" };
    return { kind: "gesture", commands: action.amount > 0 ? [maximum, current] : [current, maximum] };
  }
  switch (action.kind) {
    case "draw":
      return { kind: "command", command: { id: "DEBUG_EDIT", edit: { kind: "DRAW_CARD", side: action.side }, sourceSurface: "inspector" } };
    case "discard": {
      const command = createDiscardMostRecentHandCardCommand(state, action.side, "inspector");
      return command === null ? { kind: "none" } : { kind: "command", command };
    }
    case "shuffle":
      return { kind: "command", command: { id: "DEBUG_EDIT", edit: { kind: "REORDER_DECK", side: action.side, order: shuffled(state.sides[action.side].deck, random) }, sourceSurface: "inspector" } };
    case "erode":
      return { kind: "command", command: { id: "DEBUG_EDIT", edit: { kind: "ERODE", side: action.side, count: action.count }, sourceSurface: "inspector" } };
    case "skip-to-rewards":
      return { kind: "command", command: { id: "SKIP_TO_REWARDS", sourceSurface: "inspector" } };
    case "force-result":
      return { kind: "command", command: { id: "FORCE_RESULT", result: action.result, sourceSurface: "inspector" } };
    case "foresee":
    case "dreamwell-draw":
    case "create-figment":
      return { kind: "accessory", accessory: action.kind, side: action.side };
    case "open-zone":
      return {
        kind: "accessory",
        accessory: "open-zone",
        side: action.side,
        zone: action.zone,
      };
    case "open-pool-viewer":
      return { kind: "accessory", accessory: "pool-viewer" };
    case "open-battle-log":
      return { kind: "accessory", accessory: "battle-log" };
    case "open-dreamwell-history":
      return { kind: "accessory", accessory: "dreamwell-history" };
  }
}

function shuffled(deck: readonly string[], random: () => number): string[] {
  const order = [...deck];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}
