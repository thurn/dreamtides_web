import { describe, expect, it } from "vitest";
import { demoCard, demoCardData, demoDreamsign } from "./promotion-fixtures";

describe("Cumulus documentation collectible fixtures", () => {
  it("uses assigned art and matching UUIDs for every shared card", () => {
    for (let index = 1; index <= 6; index += 1) {
      const data = demoCardData(index);
      const model = demoCard(index);

      expect(data.imageNumber).toBeGreaterThan(0);
      expect(model.cardId).toBe(data.id);
      expect(model.displaySnapshot.id).toBe(data.id);
    }
  });

  it("uses UUID-backed image assets for every shared Dreamsign", () => {
    for (let index = 1; index <= 9; index += 1) {
      const dreamsign = demoDreamsign(index);

      expect(dreamsign.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(dreamsign.imageName).toMatch(/\.(?:png|webp)$/);
    }
  });
});
