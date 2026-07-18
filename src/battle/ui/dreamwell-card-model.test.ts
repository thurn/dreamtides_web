import { describe, expect, it } from "vitest";
import type { DreamwellCardDefinition } from "../types";
import { dreamwellCardModel } from "./dreamwell-card-model";

const DEFINITION: DreamwellCardDefinition = {
  id: "4a824c9d-8f3c-43db-b865-dc8a6b36b4a2",
  name: "Fixture Beacon",
  renderedText: "Draw a card.",
  energyAdded: 2,
  order: 3,
  cardNumber: 99,
  imageNumber: 42,
  art: { x: 0.25, y: -0.5, scale: 1.4 },
};

describe("dreamwellCardModel", () => {
  it("preserves the definition UUID as canonical identity without resolving by name", () => {
    const model = dreamwellCardModel(DEFINITION);

    expect(model.cardId).toBe(DEFINITION.id);
    expect(model.displaySnapshot).toEqual({
      id: DEFINITION.id,
      name: "Fixture Beacon",
      renderedText: "Draw a card.",
      energyAdded: 2,
      imageNumber: 42,
      art: { x: 0.25, y: -0.5, scale: 1.4 },
    });
  });
});
