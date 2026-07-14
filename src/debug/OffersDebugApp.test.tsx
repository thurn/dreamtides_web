// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import OffersDebugApp from "./OffersDebugApp";

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
      expect(
        container.querySelector(`[data-offer-category="${builder.archetypeId}"]`),
      ).not.toBeNull();
    }

    act(() => root.unmount());
    container.remove();
  });
});
