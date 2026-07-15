// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import OffersDebugApp, {
  OFFER_TILE_DEBUG_ARCHETYPE_IDS,
  OFFER_TILE_DEBUG_MODELS,
  OFFER_TILE_DEBUG_NOTES,
} from "./OffersDebugApp";

describe("OffersDebugApp", () => {
  it("shows one OfferTile for every distinct Dream Augury UI presentation", () => {
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
      expect(description?.textContent).toBe(model.description);
      expect(description?.textContent).not.toContain(model.label);
      expect(description?.textContent).not.toContain("Dream Augury");
      expect(category?.textContent).toContain(
        OFFER_TILE_DEBUG_NOTES[archetypeId],
      );
    }

    const trade = OFFER_TILE_DEBUG_MODELS.purge_replace;
    const fitCardGift = OFFER_TILE_DEBUG_MODELS.fit_card_grant;
    const strongCardGift = OFFER_TILE_DEBUG_MODELS.strong_card;
    const copiesDraft = OFFER_TILE_DEBUG_MODELS.copies_draft;
    const cardBundle = OFFER_TILE_DEBUG_MODELS.card_bundle;
    const duplicate = OFFER_TILE_DEBUG_MODELS.duplicate;
    const dreamsignDraft = OFFER_TILE_DEBUG_MODELS.dreamsign_draft;
    const starters = OFFER_TILE_DEBUG_MODELS.starter_transfigure;
    const keyword = OFFER_TILE_DEBUG_MODELS.keyword_mod;
    expect(fitCardGift.kind).toBe("card-gift");
    expect(strongCardGift.kind).toBe("card-gift");
    expect(fitCardGift.label).toBe("Card Gift");
    expect(strongCardGift.label).toBe("Card Gift");
    expect(fitCardGift.description).toBe("Add a specific card to your deck");
    expect(strongCardGift.description).toBe("Add a specific card to your deck");
    expect(copiesDraft.description).toBe(
      "Choose one card and add multiple copies of it to your deck.",
    );
    expect(cardBundle.description).toBe("Add three related cards to your deck.");
    expect(trade.kind).toBe("trade-card");
    expect(trade.kind === "trade-card" ? trade.incoming : []).toHaveLength(4);
    expect(duplicate.kind).toBe("duplicate-card");
    expect(duplicate.kind === "duplicate-card" ? duplicate.cards : []).toHaveLength(3);
    expect(dreamsignDraft.kind).toBe("dreamsign-draft");
    expect(
      dreamsignDraft.kind === "dreamsign-draft" ? dreamsignDraft.dreamsigns : [],
    ).toHaveLength(4);
    expect(starters.kind).toBe("transfigure-starters");
    expect(starters.kind === "transfigure-starters" ? starters.cards : []).toHaveLength(2);
    expect(keyword.kind).toBe("keyword-modification");
    expect(
      keyword.kind === "keyword-modification" ? keyword.card.cardId : null,
    ).toBe("2931e20b-1a80-4ddd-8944-20e68d182886");

    act(() => root.unmount());
    container.remove();
  });
});
