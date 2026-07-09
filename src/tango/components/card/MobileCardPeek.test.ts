import { describe, expect, it } from "vitest";
import { computeSupplementalInfoPlacement } from "./MobileCardPeek";

describe("mobile card peek supplemental definitions", () => {
  it("moves definitions vertically when neither side can fit without overlap", () => {
    const card = { left: 80, top: 250, width: 143, height: 200 };
    const placement = computeSupplementalInfoPlacement(
      card,
      { width: 393, height: 852 },
      177,
    );

    expect(["above", "below"]).toContain(placement.placement);
    if (placement.placement === "below") {
      expect(placement.top).toBeGreaterThanOrEqual(card.top + card.height);
    } else {
      expect(placement.bottom).toBeGreaterThanOrEqual(852 - card.top);
    }
  });

  it("keeps side definitions separated from the enlarged card", () => {
    const card = { left: 18, top: 59, width: 143, height: 200 };
    const placement = computeSupplementalInfoPlacement(
      card,
      { width: 393, height: 852 },
      177,
    );

    expect(placement.placement).toBe("right");
    expect(placement.left).toBeGreaterThan(card.left + card.width);
  });
});
