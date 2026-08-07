// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import { MINIMAL_SITES_DATA } from "../__test-helpers__/atlas-fixtures";
import OffersDebugApp, {
  buildOfferTileDebugModels,
  OFFER_TILE_DEBUG_ARCHETYPE_IDS,
  OFFER_TILE_DEBUG_NOTES,
} from "./OffersDebugApp";

const OFFER_TILE_DEBUG_MODELS = buildOfferTileDebugModels(MINIMAL_SITES_DATA);

vi.mock("../data/card-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/card-database")>();
  return {
    ...actual,
    loadCardDatabase: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock("../data/sites-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/sites-data")>();
  return {
    ...actual,
    loadSitesData: vi.fn(() => Promise.resolve(MINIMAL_SITES_DATA)),
  };
});

describe("OffersDebugApp", () => {
  it("shows one OfferTile for every distinct Augury UI presentation", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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
        tile.querySelector<HTMLElement>("[data-offer-tile-floating-frame]")
          ?.style.animationDelay,
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
      expect(category).not.toBeNull();
      expect(description?.textContent).not.toBe("");
      expect(description?.textContent).not.toMatch(/^augury-offer-/);
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
    expect(strongCardGift.kind).toBe("card-gift");
    expect(copiesDraft.kind).toBe("copies-draft");
    expect(copiesDraft.kind === "copies-draft" && copiesDraft.copyCount).toBe(2);
    expect(categoryDraft.kind).toBe("category-draft");
    expect(cardBundle.kind).toBe("card-bundle");
    expect(cardBundle.kind === "card-bundle" ? cardBundle.cards : []).toHaveLength(3);
    expect(transfigure.kind).toBe("transfigure-card");
    expect(duplicate.kind).toBe("duplicate-card");
    expect(
      duplicate.kind === "duplicate-card" ? duplicate.cards : [],
    ).toHaveLength(3);
    expect(starters.kind).toBe("transfigure-starters");
    expect(
      starters.kind === "transfigure-starters" ? starters.cards : [],
    ).toHaveLength(2);
    for (const tile of tiles) {
      const description = document.getElementById(
        tile.getAttribute("aria-describedby") ?? "",
      );
      expect(description?.textContent).not.toBe("");
      expect(description?.textContent).not.toMatch(/^augury-offer-/);
    }

    act(() => root.unmount());
    container.remove();
  });
});
