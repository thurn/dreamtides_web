// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { offerTileDescription } from "../cumulus/components/controls/offer-tile-descriptions";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import { MINIMAL_ATLAS_DATA } from "../__test-helpers__/atlas-fixtures";
import OffersDebugApp, {
  buildOfferTileDebugModels,
  OFFER_TILE_DEBUG_ARCHETYPE_IDS,
  OFFER_TILE_DEBUG_NOTES,
} from "./OffersDebugApp";

const OFFER_TILE_DEBUG_MODELS = buildOfferTileDebugModels(MINIMAL_ATLAS_DATA);

vi.mock("../data/card-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/card-database")>();
  return {
    ...actual,
    loadCardDatabase: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock("../data/atlas-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/atlas-data")>();
  return {
    ...actual,
    loadAtlasData: vi.fn(() => Promise.resolve(MINIMAL_ATLAS_DATA)),
  };
});

describe("OffersDebugApp", () => {
  it("shows one OfferTile for every distinct Augury UI presentation", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OffersDebugApp />
        </CumulusRoot>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const tiles = container.querySelectorAll("[data-offer-tile]");
    expect(tiles).toHaveLength(OFFER_TILE_DEBUG_ARCHETYPE_IDS.length);
    expect(MERCHANT_ARCHETYPE_BUILDERS).toHaveLength(17);
    expect(OFFER_TILE_DEBUG_ARCHETYPE_IDS).toHaveLength(16);
    expect(OFFER_TILE_DEBUG_ARCHETYPE_IDS).not.toContain("strong_card");
    expect(OFFER_TILE_DEBUG_ARCHETYPE_IDS).toContain("category_draft_known");
    const motionDelays = [...tiles].map(
      (tile) =>
        tile.querySelector<HTMLElement>("[data-offer-tile-floating-frame]")?.style
          .animationDelay,
    );
    expect(new Set(motionDelays).size).toBeGreaterThan(8);
    for (const archetypeId of OFFER_TILE_DEBUG_ARCHETYPE_IDS) {
      const category = container.querySelector(
        `[data-offer-category="${archetypeId}"]`,
      );
      const tile = category?.querySelector<HTMLElement>("[data-offer-tile]");
      const description = document.getElementById(
        tile?.getAttribute("aria-describedby") ?? "",
      );
      const model = OFFER_TILE_DEBUG_MODELS[archetypeId];
      expect(category).not.toBeNull();
      expect(description?.textContent).toBe(offerTileDescription(model));
      expect(description?.textContent).not.toContain("Augury");
      expect(category?.textContent).toContain(
        OFFER_TILE_DEBUG_NOTES[archetypeId],
      );
    }

    const fitCardGift = OFFER_TILE_DEBUG_MODELS.fit_card_grant;
    const strongCardGift = OFFER_TILE_DEBUG_MODELS.strong_card;
    const copiesDraft = OFFER_TILE_DEBUG_MODELS.copies_draft;
    const categoryDraft = OFFER_TILE_DEBUG_MODELS.category_draft_known;
    const cardBundle = OFFER_TILE_DEBUG_MODELS.card_bundle;
    const transfigure = OFFER_TILE_DEBUG_MODELS.transfigure;
    const duplicate = OFFER_TILE_DEBUG_MODELS.duplicate;
    const starters = OFFER_TILE_DEBUG_MODELS.starter_transfigure;
    expect(fitCardGift.kind).toBe("card-gift");
    expect(strongCardGift.kind).toBe("card-gift");
    expect(offerTileDescription(fitCardGift)).toContain("to your deck.");
    expect(offerTileDescription(strongCardGift)).toContain("to your deck.");
    expect(offerTileDescription(copiesDraft)).toBe(
      "Choose a card and add two copies of it to your deck.",
    );
    expect(offerTileDescription(categoryDraft)).toBe(
      "Choose a card from a single category to add to your deck.",
    );
    expect(offerTileDescription(cardBundle)).toBe(
      "Add three cards to your deck.",
    );
    expect(offerTileDescription(transfigure)).toBe(
      "Transfigure a card in your deck.",
    );
    expect(duplicate.kind).toBe("duplicate-card");
    expect(duplicate.kind === "duplicate-card" ? duplicate.cards : []).toHaveLength(3);
    expect(offerTileDescription(duplicate)).toBe(
      "Choose one of three cards in your deck to duplicate.",
    );
    expect(starters.kind).toBe("transfigure-starters");
    expect(starters.kind === "transfigure-starters" ? starters.cards : []).toHaveLength(2);
    expect(offerTileDescription(starters)).toBe(
      "Transfigure two starter cards.",
    );
    for (const model of Object.values(OFFER_TILE_DEBUG_MODELS)) {
      const description = offerTileDescription(model);
      expect(description).not.toMatch(/\d/);
      expect(description).not.toContain("Loading Card");
      expect(description).not.toContain("Rainbow Horn");
      expect(description).not.toContain("Duplication");
    }

    act(() => root.unmount());
    container.remove();
  });
});
