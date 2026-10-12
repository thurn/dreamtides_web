import { describe, expect, it } from "vitest";
import { classifyInventoryText } from "./content-inventory";

// Synthetic printed text: each parameterized form needs its variant capability, and the
// fixed forms it refines keep their own capability.
const needsOf = (text: string): string[] => {
  const { requiredPrimitives } = classifyInventoryText(text);
  return [...requiredPrimitives.existing, ...requiredPrimitives.new];
};

const VARIANTS = ["abandonXCost", "discardCostFilterMin", "voidTargetXBound", "boundSourceSpark", "cardFilterSparkBounds", "grantReclaimTriggeringCard", "activatedFromVoid"];

describe("inventory parameterized variant classification", () => {
  it.each([
    ["1●, Abandon X figments: Dissolve an enemy with X✦.", "abandonXCost", ["abandonCost"]],
    ["Gain X⍟.\n\nReclaim – Discard X cards.", "discardCostFilterMin", []],
    ["Choose up to two ≤X● cost events in your void to gain reclaim 0●.", "voidTargetXBound", ["selectorBounds"]],
    ["Abandon this character: Dissolve an enemy with ✦ less than or equal to this character's ✦.", "boundSourceSpark", ["selectorBounds", "valueCardStats"]],
    ["▸Dawn: Choose an event in your void with cost less than or equal to this character's ✦. That event gains reclaim 0●.", "boundSourceSpark", ["selectorBounds"]],
    ["▸Materialized: Discover a ≤2✦ character.", "cardFilterSparkBounds", []],
    ["When you discard a card, it gains reclaim.", "grantReclaimTriggeringCard", []],
    ["Once per turn, when you abandon a character or discard a character, that card gains reclaim.", "grantReclaimTriggeringCard", []],
    ["2●, Banish a card from your void: Materialize this character from your void.", "activatedFromVoid", []],
  ] as const)("routes %j to its variant", (text, variant, refined) => {
    const needs = needsOf(text);
    expect(needs).toContain(variant);
    for (const fixed of refined) expect(needs).not.toContain(fixed);
  });

  it("keeps the fixed abandon cost for a fixed count", () => {
    for (const text of ["Abandon a character: Draw a card.", "☾, Abandon 2 warrior figments: Draw a card.", "Abandon this character: Gain 1●."]) {
      const needs = needsOf(text);
      expect(needs).toContain("abandonCost");
      expect(needs).not.toContain("abandonXCost");
    }
  });

  it("claims only the parameterized clause, so a fixed clause in the same text keeps its form", () => {
    const needs = needsOf("1●, Abandon X figments: Draw a card.\n\nAbandon a character: Gain 1●.");
    expect(needs).toEqual(expect.arrayContaining(["abandonXCost", "abandonCost"]));
    const bounds = needsOf("Gain control of a ≤X● cost enemy. Choose up to two ≤X● cost events in your void to gain reclaim.");
    expect(bounds).toEqual(expect.arrayContaining(["selectorBounds", "voidTargetXBound"]));
  });

  it.each([
    ["Discard a card: Gain 1●.", ["discardCost"]],
    ["Discard X cards: Gain 1●.", ["discardCost", "discardCostFilter"]],
    ["To play this event, discard X cards. Draw X+1 cards.", ["discardCost", "discardCostFilter"]],
  ] as const)("keeps a zero-admitting discard cost without a least X: %j", (text, fixed) => {
    const needs = needsOf(text);
    expect(needs).toEqual(expect.arrayContaining([...fixed]));
    expect(needs).not.toContain("discardCostFilterMin");
  });

  it("keeps fixed and character-selector bounds on their fixed forms", () => {
    expect(needsOf("Gain control of a ≤X● cost enemy.")).toContain("selectorBounds");
    expect(needsOf("Materialize each ≤X● cost character in your void.")).toContain("selectorBounds");
    expect(needsOf("Dissolve an enemy with ✦ less than or equal to the number of cards in your void.")).toContain("selectorBounds");
    expect(needsOf("▸Dissolved: Gain ⍟ equal to this character's ✦.")).toContain("valueCardStats");
    for (const text of ["Dissolve a ≤2● cost enemy.", "Dissolve a ≤2✦ enemy.", "Prevent a played ≤2✦ character.", "Gain control of a ≤X● cost enemy.", "▸Dissolved: Gain ⍟ equal to this character's ✦."]) {
      expect(needsOf(text).filter((need) => VARIANTS.includes(need))).toEqual([]);
    }
  });

  it("keeps Reclaim grants to named, moved, or self cards on the fixed grant", () => {
    for (const text of ["When you discard this card, it gains reclaim 0●.", "When you discard or erode this card, it gains reclaim 0●.", "Choose an event in your void to gain reclaim.", "5●: Erode 1. That card gains reclaim 0●."]) {
      const needs = needsOf(text);
      expect(needs).toContain("grantReclaim");
      expect(needs).not.toContain("grantReclaimTriggeringCard");
    }
  });

  it("keeps triggered and void-reading abilities off the activated-from-void variant", () => {
    for (const text of [
      "When a character you control is dissolved, you may pay 1● to materialize this character from your void.",
      "Abandon this character: Return a character from your void to your hand.",
      "▸Dissolved: Materialize this character from your void.",
    ]) expect(needsOf(text)).not.toContain("activatedFromVoid");
  });
});
