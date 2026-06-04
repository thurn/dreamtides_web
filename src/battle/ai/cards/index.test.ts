import { describe, expect, it } from "vitest";
import { starterCardModels } from "./index";

describe("starterCardModels registry", () => {
  it("is a Map instance", () => {
    expect(starterCardModels).toBeInstanceOf(Map);
  });

  it("every entry is keyed by its own cardNumber", () => {
    for (const [key, model] of starterCardModels) {
      expect(model.cardNumber).toBe(key);
    }
  });
});
