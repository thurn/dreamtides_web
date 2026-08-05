import { describe, expect, it } from "vitest";
import type { BattleCardInstance } from "../types";
import {
  cardIsRevealedTo,
  normalizeCardVisibility,
} from "./card-visibility";

function legacyInstance(
  controller: "player" | "enemy",
  isRevealedToPlayer: boolean,
): BattleCardInstance {
  return {
    battleCardId: "bc_legacy_visibility",
    definition: {
      sourceDeckEntryId: null,
      cardId: "00000000-0000-4000-8000-000000000101",
      cardNumber: 101,
      name: "Fixture",
      battleCardKind: "character",
      subtype: "Fixture",
      energyCost: 1,
      printedEnergyCost: 1,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 101,
      transfiguration: null,
      isBane: false,
    },
    owner: controller,
    controller,
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer,
    status: {
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedVengeful: false,
      grantedPreeminence: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "journey-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

describe("battle card visibility compatibility", () => {
  it("normalizes a legacy enemy card into player knowledge and controller knowledge", () => {
    const instance = legacyInstance("enemy", false);
    expect(cardIsRevealedTo(instance, "player")).toBe(false);
    expect(cardIsRevealedTo(instance, "enemy")).toBe(true);

    normalizeCardVisibility(instance);
    expect(instance.revealedTo).toEqual({ player: false, enemy: true });
    expect(instance.isRevealedToPlayer).toBeUndefined();
  });

  it("preserves a legacy player reveal while defaulting the other viewer by controller", () => {
    const instance = legacyInstance("player", true);
    normalizeCardVisibility(instance);
    expect(instance.revealedTo).toEqual({ player: true, enemy: false });
  });
});
