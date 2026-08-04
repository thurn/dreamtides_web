// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { offerTileDescription } from "../cumulus/components/controls/offer-tile-descriptions";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import OffersDebugApp, {
  OFFER_TILE_DEBUG_ARCHETYPE_IDS,
  OFFER_TILE_DEBUG_MODELS,
  OFFER_TILE_DEBUG_NOTES,
} from "./OffersDebugApp";

vi.mock("../data/card-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/card-database")>();
  return {
    ...actual,
    loadCardDatabase: vi.fn(() => new Promise(() => {})),
  };
});

describe("OffersDebugApp", () => {
  it("shows one OfferTile for every distinct Augury UI presentation", () => {
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

    const trade = OFFER_TILE_DEBUG_MODELS.purge_replace;
    const fitCardGift = OFFER_TILE_DEBUG_MODELS.fit_card_grant;
    const strongCardGift = OFFER_TILE_DEBUG_MODELS.strong_card;
    const copiesDraft = OFFER_TILE_DEBUG_MODELS.copies_draft;
    const categoryDraft = OFFER_TILE_DEBUG_MODELS.category_draft_known;
    const cardBundle = OFFER_TILE_DEBUG_MODELS.card_bundle;
    const transfigure = OFFER_TILE_DEBUG_MODELS.transfigure;
    const duplicate = OFFER_TILE_DEBUG_MODELS.duplicate;
    const dreamsignDraft = OFFER_TILE_DEBUG_MODELS.dreamsign_draft;
    const starters = OFFER_TILE_DEBUG_MODELS.starter_transfigure;
    const keyword = OFFER_TILE_DEBUG_MODELS.keyword_mod;
    const characterType = OFFER_TILE_DEBUG_MODELS.tribal_change;
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
    expect(trade.kind).toBe("trade-card");
    expect(trade.kind === "trade-card" ? trade.incoming : []).toHaveLength(4);
    expect(duplicate.kind).toBe("duplicate-card");
    expect(duplicate.kind === "duplicate-card" ? duplicate.cards : []).toHaveLength(3);
    expect(offerTileDescription(duplicate)).toBe(
      "Choose one of three cards in your deck to duplicate.",
    );
    expect(dreamsignDraft.kind).toBe("dreamsign-draft");
    expect(
      dreamsignDraft.kind === "dreamsign-draft" ? dreamsignDraft.dreamsigns : [],
    ).toHaveLength(4);
    expect(starters.kind).toBe("transfigure-starters");
    expect(starters.kind === "transfigure-starters" ? starters.cards : []).toHaveLength(2);
    expect(offerTileDescription(starters)).toBe(
      "Transfigure two starter cards.",
    );
    expect(keyword.kind).toBe("keyword-modification");
    expect(
      keyword.kind === "keyword-modification" ? keyword.card.cardId : null,
    ).toBe("2931e20b-1a80-4ddd-8944-20e68d182886");
    expect(offerTileDescription(keyword)).toBe(
      "Reduce the Reclaim cost of a card.",
    );
    expect(offerTileDescription(characterType)).toBe(
      "Change the subtype of a card.",
    );
    expect(offerTileDescription(dreamsignDraft)).toBe(
      "Choose a dreamsign to gain.",
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
