import { afterEach, describe, expect, it } from "vitest";
import {
  hydrateFigmentCatalog,
  resetFigmentCatalogHydration,
} from "../battle/state/figment-catalog";
import { extractMaterializedFigmentPreviews } from "./materialized-figments";

const WARRIOR_ID = "bb1a5acd-1a03-4aa3-826d-f0a301843845";
const LEGIONNAIRE_ID = "e757b306-5bab-4a5a-8493-28c0f3aa6440";

function hydrate(): void {
  hydrateFigmentCatalog([
    {
      id: WARRIOR_ID,
      name: "Warrior",
      subtype: "Warrior",
      spark: 1,
      imageNumber: 436090582,
      artOwned: false,
      art: { x: 0, y: 0.123, scale: 1.2 },
    },
    {
      id: LEGIONNAIRE_ID,
      name: "Legionnaire",
      subtype: "Warrior",
      spark: 0,
      renderedText: "This character has +1✦ for each allied warrior.",
      imageNumber: 653554603,
      artOwned: false,
    },
  ]);
}

afterEach(() => resetFigmentCatalogHydration());

describe("extractMaterializedFigmentPreviews", () => {
  it("resolves an authored figment by UUID with its complete display card", () => {
    hydrate();
    const [preview] = extractMaterializedFigmentPreviews(
      "Abandon a character: Materialize a 1✦ warrior figment.",
    );
    expect(preview).toMatchObject({
      titleBar: false,
      card: {
        id: WARRIOR_ID,
        name: "Warrior",
        subtype: "Warrior",
        spark: 1,
        imageNumber: 436090582,
        art: { x: 0, y: 0.123, scale: 1.2 },
      },
    });
  });

  it("prefers an authored name over another entry's shared subtype", () => {
    hydrate();
    const [preview] = extractMaterializedFigmentPreviews(
      "Materialize a Legionnaire figment.",
    );
    expect(preview?.card.id).toBe(LEGIONNAIRE_ID);
    expect(preview?.titleBar).toBe(true);
  });

  it("deduplicates plural references in reading order", () => {
    hydrate();
    const previews = extractMaterializedFigmentPreviews(
      "Materialize two 1✦ warrior figments. Then materialize a Legionnaire figment and materialize a 1✦ warrior figment.",
    );
    expect(previews.map((preview) => preview.card.id)).toEqual([
      WARRIOR_ID,
      LEGIONNAIRE_ID,
    ]);
  });

  it.each([
    "Whenever you materialize a figment, draw a card.",
    "Materialize a non-figment character from your hand.",
    "Rematerialize a warrior figment.",
  ])("skips generic or unrelated text: %s", (text) => {
    hydrate();
    expect(extractMaterializedFigmentPreviews(text)).toEqual([]);
  });
});
