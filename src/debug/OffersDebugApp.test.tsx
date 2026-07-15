// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import OffersDebugApp, {
  OFFER_TILE_DEBUG_MODELS,
  OFFER_TILE_DEBUG_NOTES,
} from "./OffersDebugApp";

describe("OffersDebugApp", () => {
  it("shows one OfferTile for every canonical Dream Augury archetype", () => {
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
    expect(tiles).toHaveLength(MERCHANT_ARCHETYPE_BUILDERS.length);
    expect(MERCHANT_ARCHETYPE_BUILDERS).toHaveLength(17);
    for (const builder of MERCHANT_ARCHETYPE_BUILDERS) {
      const category = container.querySelector(
        `[data-offer-category="${builder.archetypeId}"]`,
      );
      const tile = category?.querySelector<HTMLElement>("[data-offer-tile]");
      const description = document.getElementById(
        tile?.getAttribute("aria-describedby") ?? "",
      );
      const model = OFFER_TILE_DEBUG_MODELS[builder.archetypeId];
      expect(category).not.toBeNull();
      expect(description?.textContent).toBe(model.description);
      expect(description?.textContent).not.toContain(model.label);
      expect(description?.textContent).not.toContain("Dream Augury");
      expect(category?.textContent).toContain(
        OFFER_TILE_DEBUG_NOTES[builder.archetypeId],
      );
    }

    const trade = OFFER_TILE_DEBUG_MODELS.purge_replace;
    const duplicate = OFFER_TILE_DEBUG_MODELS.duplicate;
    const dreamsignDraft = OFFER_TILE_DEBUG_MODELS.dreamsign_draft;
    const starters = OFFER_TILE_DEBUG_MODELS.starter_transfigure;
    const keyword = OFFER_TILE_DEBUG_MODELS.keyword_mod;
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
