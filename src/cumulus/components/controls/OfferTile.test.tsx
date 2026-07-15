// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { asCardId } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { OfferTile, type OfferTileModel } from "./OfferTile";

const MODEL: OfferTileModel = {
  id: "debug-fit-card-draft",
  kind: "card-draft",
  label: "Card Draft",
  description: "Choose a card from 4 to add to your deck.",
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
    expect(source.style.borderRadius).toBe("var(--radius-panel)");
    expect(source.style.background).toBe("transparent");
    expect(source.style.border).toBe("0px");
    expect(source.querySelector("[data-offer-tile-background]")).not.toBeNull();
    const floatingFrame = source.querySelector<HTMLElement>(
      "[data-offer-tile-floating-frame]",
    );
    expect(floatingFrame).not.toBeNull();
    expect(floatingFrame?.querySelector("[data-offer-tile-background]")).not.toBeNull();
    const frame = source.querySelector<HTMLImageElement>("[data-offer-tile-frame]");
    expect(frame?.src).toContain("Skill_Frame_iron.png");
    expect(frame?.draggable).toBe(false);
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.style.pointerEvents).toBe("none");
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
      "Choose a card from 4 to add to your deck.",
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
      description: "Choose a dreamsign from 4 visions.",
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

  it("widens every card-art chip to a square at its existing height", () => {
    const gift: OfferTileModel = {
      id: "debug-gift",
      kind: "card-gift",
      label: "Card Gift",
      description: "Add a specific card to your deck",
      card: MODEL.cards[0],
    };
    const trade: OfferTileModel = {
      id: "debug-trade-squares",
      kind: "trade-card",
      label: "Trade Card",
      description: "Purge a card and choose a replacement from 4 cards.",
      outgoing: MODEL.cards[0],
      incoming: MODEL.cards,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={gift} onPress={() => {}} testId="gift-tile" />
          <OfferTile model={MODEL} onPress={() => {}} testId="draft-tile" />
          <OfferTile model={trade} onPress={() => {}} testId="trade-square-tile" />
        </CumulusRoot>,
      );
    });

    const expectSquareChips = (testId: string, edge: string) => {
      const chips = container.querySelectorAll<HTMLElement>(
        `[data-testid="${testId}"] [data-offer-tile-card-id]`,
      );
      expect(chips.length).toBeGreaterThan(0);
      chips.forEach((chip) => {
        expect(chip.style.width).toBe(edge);
        expect(chip.style.height).toBe(edge);
      });
    };

    expectSquareChips("gift-tile", "108px");
    expectSquareChips("draft-tile", "68px");
    expect(
      container.querySelector('[data-testid="gift-tile"] [data-offer-tile-operation]'),
    ).toBeNull();

    const tradeChips = container.querySelectorAll<HTMLElement>(
      '[data-testid="trade-square-tile"] [data-offer-tile-card-id]',
    );
    [...tradeChips].forEach((chip) => {
      expect(chip.style.width).toBe("50px");
      expect(chip.style.height).toBe("50px");
    });

    act(() => root.unmount());
    container.remove();
  });

  it("renders every surfaced chooser object without representative truncation", () => {
    const cards = MODEL.cards;
    const trade: OfferTileModel = {
      id: "debug-trade",
      kind: "trade-card",
      label: "Trade Card",
      description: "Purge a card and choose a replacement from 4 cards.",
      outgoing: cards[0],
      incoming: cards,
    };
    const duplicate: OfferTileModel = {
      id: "debug-duplicate",
      kind: "duplicate-card",
      label: "Duplicate Card",
      description: "Choose a card to duplicate from 3 cards in your deck.",
      cards: [cards[0], cards[1], cards[2]],
    };
    const copies: OfferTileModel = {
      id: "debug-copies",
      kind: "copies-draft",
      label: "Copies Draft",
      description: "Choose a card.",
      copyCount: 2,
      cards,
    };
    const bundle: OfferTileModel = {
      id: "debug-bundle",
      kind: "card-bundle",
      label: "Card Bundle",
      description: "Add 3 related cards to your deck.",
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
          <OfferTile model={copies} onPress={() => {}} testId="copies-tile" />
          <OfferTile model={bundle} onPress={() => {}} testId="bundle-tile" />
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
    expect(
      container.querySelector(
        '[data-testid="copies-tile"] [data-offer-tile-operation-layout]',
      )?.getAttribute("data-offer-tile-operation-layout"),
    ).toBe("overlay");
    const copiesTile = container.querySelector<HTMLElement>(
      '[data-testid="copies-tile"]',
    );
    expect(
      document.getElementById(copiesTile?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Choose a card from 4 and add 2 copies of it to your deck.");
    expect(
      container.querySelector(
        '[data-testid="duplicate-tile"] [data-offer-tile-operation-layout]',
      )?.getAttribute("data-offer-tile-operation-layout"),
    ).toBe("diagonal");
    expect(
      container.querySelector(
        '[data-testid="trade-tile"] [data-offer-tile-operation]',
      ),
    ).toBeNull();
    const tradeChips = container.querySelectorAll<HTMLElement>(
      '[data-testid="trade-tile"] [data-offer-tile-card-id]',
    );
    expect([...tradeChips].every((chip) => chip.style.width === "50px")).toBe(true);
    expect(
      container.querySelectorAll(
        '[data-testid="bundle-tile"] [data-offer-tile-card-id]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-testid="bundle-tile"] [data-offer-tile-operation]',
      ),
    ).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("uses balanced diagonal card-and-mark compositions and keeps purge art visible", () => {
    const transfigure: OfferTileModel = {
      id: "debug-transfigure",
      kind: "transfigure-card",
      label: "Transfigure Card",
      description: "Transfigure a card in your deck.",
      card: MODEL.cards[0],
    };
    const purge: OfferTileModel = {
      id: "debug-purge",
      kind: "purge-card",
      label: "Purge Card",
      description: "Purge a card.",
      card: MODEL.cards[1],
    };
    const addSite: OfferTileModel = {
      id: "debug-add-site",
      kind: "add-site",
      label: "Add Site",
      description: "Add a site to the current dreamscape.",
      site: { id: "Duplication", glyph: GLYPHS.copy },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={transfigure} onPress={() => {}} testId="transfigure" />
          <OfferTile model={purge} onPress={() => {}} testId="purge" />
          <OfferTile model={addSite} onPress={() => {}} testId="add-site" />
        </CumulusRoot>,
      );
    });

    for (const testId of ["transfigure", "purge"]) {
      const mark = container.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-offer-tile-operation-layout]`,
      );
      expect(mark?.dataset.offerTileOperationLayout).toBe("diagonal");
      expect(mark?.style.width).toBe("82px");
      expect(mark?.style.height).toBe("82px");
    }
    const purgedCard = container.querySelector<HTMLElement>(
      '[data-testid="purge"] [data-offer-tile-card-id]',
    );
    expect(purgedCard?.style.filter).toBe("");
    expect(purgedCard?.style.boxShadow).toContain("var(--danger)");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="add-site"] [data-offer-tile-site-glyph]',
      )?.style.fontSize,
    ).toBe("60px");

    act(() => root.unmount());
    container.remove();
  });
});
