import { describe, expect, it } from "vitest";
import { classifyInventoryText } from "./content-inventory";

const requirements = (text: string) => {
  const classified = classifyInventoryText(text);
  return { ...classified, needs: [...classified.requiredPrimitives.existing, ...classified.requiredPrimitives.new] };
};

describe("inventory discard cost classification", () => {
  it.each([
    "Discard your hand: Gain 1●.",
    "To play this event, discard your hand. Gain 1⍟.",
    "Reclaim – Discard your hand",
  ])("uses mandatory whole-hand payment without a chosen-discard prompt: %s", (text) => {
    const result = requirements(text);
    expect(result.tags).toContain("cost-discard-hand");
    expect(result.needs).toContain("discardHandCost");
    expect(result.needs).not.toContain("discardCost");
    expect(result.needs).not.toContain("discardCostFilter");
    expect(result.promptKinds).not.toContain("chooseCards:discardCost");
  });

  it.each([
    ["Discard a card: Gain 1●.", false],
    ["Discard an event: Gain 1●.", true],
    ["Discard X cards: Gain 1●.", true],
  ] as const)("keeps chosen discard requirements and prompts: %s", (text, filtered) => {
    const result = requirements(text);
    expect(result.needs).toContain("discardCost");
    expect(result.needs.includes("discardCostFilter")).toBe(filtered);
    expect(result.needs).not.toContain("discardHandCost");
    expect(result.promptKinds).toContain("chooseCards:discardCost");
  });

  it("keeps the chosen prompt when both discard costs appear in the same clause", () => {
    const result = requirements("To play this event, discard a card, then discard your hand. Gain 1⍟.");
    expect(result.needs).toEqual(expect.arrayContaining(["discardCost", "discardHandCost"]));
    expect(result.promptKinds).toContain("chooseCards:discardCost");
  });

  it("classifies whole-hand discard in an effect separately from a payment", () => {
    const result = requirements("Discard your hand. Draw 2 cards.");
    expect(result.needs).not.toContain("discardHandCost");
    expect(result.tags).not.toContain("cost-discard-hand");
  });
});
