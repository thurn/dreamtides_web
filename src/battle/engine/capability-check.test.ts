import { describe, expect, it } from "vitest";
import { testCardName } from "../../types/test-identities";
import { needsManualResolution } from "./capability-check";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import type { BattleCardInstance } from "../types";
import { parseBattleCardId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";

/**
 * Build a minimal BattleCardInstance for testing. Only `definition.cardNumber`
 * and `definition.renderedText` are examined by needsManualResolution; all
 * other fields are filled with benign defaults.
 */
function makeInstance(
  renderedText: string,
  cardNumber: number,
): BattleCardInstance {
  return {
    battleCardId: parseBattleCardId(`test-${cardNumber}`),
    definition: {
      sourceDeckEntryId: null,
      cardId: testCardId("fixture-card"),
      cardNumber,
      name: testCardName(`Test Card ${cardNumber}`),
      battleCardKind: "character",
      subtype: "Warrior",
      energyCost: 1,
      printedEnergyCost: 1,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText,
      imageNumber: cardNumber,
      transfiguration: null,
      isBane: false,
    },
    owner: "player",
    controller: "player",
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
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

// The modeled Starter card numbers used throughout this test suite.
const MODELED: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

describe("needsManualResolution", () => {
  describe("allowlist — modeled Starter cards always return false", () => {
    it("returns false for a modeled card even when its text contains a ▸ trigger", () => {
      // Card #1 from cards_v2-data.json: '▸Challenge: Banish an enemy until end of turn.'
      const instance = makeInstance(
        "▸Challenge: Banish an enemy until end of turn.",
        1,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });

    it("returns false for a modeled card with Vengeful keyword", () => {
      const instance = makeInstance(
        "Vengeful\n\nWhen you play a card from your void, return this character to play.",
        6,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });

    it("returns false for a modeled card with an en-dash keyword line", () => {
      // Synthetic trigger-laden text on a modeled number — allowlist wins regardless.
      const instance = makeInstance("Support – Supported allies have +2✦.", 3);
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });
  });

  describe("trigger marker ▸ (U+25B8)", () => {
    it("returns true for an unmodeled card whose text starts with ▸", () => {
      // Real text from card #1 in cards_v2-data.json
      const instance = makeInstance(
        "▸Challenge: Banish an enemy until end of turn.",
        100,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });

    it("returns true when ▸ appears mid-text (second paragraph)", () => {
      // Real text from card #4 in cards_v2-data.json
      const instance = makeInstance(
        "▸Dawn: Gain 1●.\n\n4●, ☾: This character gains +1✦.",
        200,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });
  });

  describe("en-dash keyword separator – (U+2013)", () => {
    it("returns true for an unmodeled card with 'Support – ...' keyword line", () => {
      // Real text from card #35 in cards_v2-data.json
      const instance = makeInstance(
        "Support – Supported allies have +2✦.\n\nReclaim – 3●, Banish 3 cards from your void.",
        300,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });

    it("returns true for an unmodeled card with a standalone 'Reclaim –' keyword", () => {
      const instance = makeInstance(
        "Reclaim – 2●: Return this from void.",
        301,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });
  });

  describe("resolution keyword (case-insensitive word match)", () => {
    it("returns true for an unmodeled card with standalone 'Vengeful'", () => {
      // Real text from card #6 in cards_v2-data.json (not in MODELED set)
      const instance = makeInstance(
        "Vengeful\n\nWhen you play a card from your void, return this character to play.",
        6,
      );
      // Card 6 is in MODELED — use a non-modeled number but same text pattern.
      const instance2 = makeInstance(
        "Vengeful\n\nWhen you play a card from your void, return this character to play.",
        400,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(false); // allowlisted
      expect(needsManualResolution(instance2, MODELED)).toBe(true);
    });
  });

  describe("static spark text +<number>✦ (U+2726)", () => {
    it("returns true for an unmodeled card with '+2✦' in text", () => {
      // Real text from card #49 in cards_v2-data.json (subset)
      const instance = makeInstance("Allied spirit animals have +1✦.", 49);
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });

    it("returns true for '+4✦' variant", () => {
      // Real text from card #28 in cards_v2-data.json
      const instance = makeInstance(
        "If there are 7 or more cards in your void, this character has +4✦ and gains awakened.",
        28,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });

    it("returns true for '+X✦' (variable spark — conservative pause required)", () => {
      // Cards #42 and #374 carry only "+X✦" with no triggered-ability or keyword
      // marker, so Rule 4 must catch them to preserve the conservative bias.
      const instance = makeInstance(
        "Until end of turn, allied characters gain +X✦ where X is the number of allies.",
        600,
      );
      expect(needsManualResolution(instance, MODELED)).toBe(true);
    });
  });

  describe("vanilla body — empty or plain text returns false", () => {
    it("returns false for an unmodeled card with empty renderedText", () => {
      const instance = makeInstance("", 700);
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });

    it("returns false for an unmodeled card with whitespace-only renderedText", () => {
      const instance = makeInstance("   \n  ", 701);
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });

    it("returns false for an unmodeled card with plain effect text and no markers", () => {
      // Real text from card #3 in cards_v2-data.json — simple draw spell.
      const instance = makeInstance("Offering\n\nDraw 2 cards.", 702);
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });

    it("returns false for a plain text card outside modeledCardNumbers", () => {
      // Real text from card #11: 'Gain 4●.' — no markers, no keywords, no spark.
      const instance = makeInstance("Gain 4●.", 800);
      expect(needsManualResolution(instance, MODELED)).toBe(false);
    });
  });
});
