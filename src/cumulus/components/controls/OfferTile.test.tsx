// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { asCardId } from "../../../types/card-identity";
import { OfferTile, type OfferTileModel } from "./OfferTile";

const MODEL: OfferTileModel = {
  id: "debug-fit-card-draft",
  kind: "card-draft",
  label: "Card Draft",
  description: "Choose one of four cards to add to your deck.",
  cards: [
    { cardId: asCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"), imageNumber: 287269511 },
    { cardId: asCardId("161482b6-af07-4d9e-822d-8c738672beb9"), imageNumber: 2022594419 },
    { cardId: asCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"), imageNumber: 618071684 },
    { cardId: asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"), imageNumber: 1196004046 },
  ],
};

describe("OfferTile", () => {
  it("renders a fixed symbolic button with one tile-level reveal source", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    const activate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={MODEL} onPress={activate} />
        </CumulusRoot>,
      );
    });

    const source = container.querySelector<HTMLButtonElement>("[data-offer-tile]")!;
    expect(source.tagName).toBe("BUTTON");
    expect(source.style.width).toBe("200px");
    expect(source.style.height).toBe("200px");
    expect(source.style.borderRadius).toBe("var(--radius-pill)");
    expect(source.dataset.revealEntityType).toBe("offer");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("text");
    expect(source.querySelectorAll("[data-offer-tile-card-id]")).toHaveLength(4);
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(0);
    expect(
      [...source.querySelectorAll<HTMLElement>("[data-offer-tile-visual] *")].every(
        (node) => node.style.pointerEvents === "none" || node.closest("[data-offer-tile-visual]")?.getAttribute("style")?.includes("pointer-events: none"),
      ),
    ).toBe(true);

    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toBe(
      "Choose one of four cards to add to your deck.",
    );
    expect(description?.textContent).not.toContain("Dream Augury");
    expect(description?.textContent).not.toContain("Card Draft");

    act(() => source.click());
    expect(activate).toHaveBeenCalledWith(MODEL.id);

    act(() => root.unmount());
    container.remove();
  });

  it("keeps each inner dreamsign decorative under the tile's single hover target", () => {
    const model: OfferTileModel = {
      id: "debug-dreamsign-draft",
      kind: "dreamsign-draft",
      label: "Dreamsign Draft",
      description: "Choose one dreamsign from a small group of visions.",
      dreamsigns: [
        {
          id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
          art: { kind: "dreamsign", imageName: "acorn_gold.png" },
        },
        {
          id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
          art: { kind: "dreamsign", imageName: "aertfact.png" },
        },
        {
          id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
          art: { kind: "dreamsign", imageName: "amanita.png" },
        },
        {
          id: "49990864-1DB0-4C08-91AE-40A1F04223E4",
          art: { kind: "dreamsign", imageName: "algae.png" },
        },
      ],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={model} onPress={() => {}} />
        </CumulusRoot>,
      );
    });

    const source = container.querySelector<HTMLElement>("[data-offer-tile]")!;
    expect(source.querySelectorAll("[data-offer-tile-dreamsign-id]")).toHaveLength(4);
    expect(source.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(0);

    act(() => root.unmount());
    container.remove();
  });

  it("renders every surfaced chooser object without representative truncation", () => {
    const cards = MODEL.cards;
    const trade: OfferTileModel = {
      id: "debug-trade",
      kind: "trade-card",
      label: "Trade Card",
      description: "Purge one card and choose one of four replacements.",
      outgoing: cards[0],
      incoming: cards,
    };
    const duplicate: OfferTileModel = {
      id: "debug-duplicate",
      kind: "duplicate-card",
      label: "Duplicate Card",
      description: "Choose one of up to three cards in your deck to duplicate.",
      cards: [cards[0], cards[1], cards[2]],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={trade} onPress={() => {}} testId="trade-tile" />
          <OfferTile model={duplicate} onPress={() => {}} testId="duplicate-tile" />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelectorAll('[data-testid="trade-tile"] [data-offer-tile-card-id]'),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll(
        '[data-testid="duplicate-tile"] [data-offer-tile-card-id]',
      ),
    ).toHaveLength(3);

    act(() => root.unmount());
    container.remove();
  });
});
