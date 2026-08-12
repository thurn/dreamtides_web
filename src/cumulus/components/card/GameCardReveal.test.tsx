// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import * as glossary from "../../../data/glossary";
import { extractProjectedGlossaryTerms } from "../../../data/glossary-terms";
import { extractMaterializedFigmentPreviews } from "../../../data/materialized-figments";
import { GameCard, type GameCardModel } from "./CardView";
import { transfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";

vi.mock("../../../data/materialized-figments", () => ({
  extractMaterializedFigmentPreviews: vi.fn(() => []),
}));

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
let resizeCallbacks: ResizeObserverCallback[] = [];

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: CARD_ID,
    name: asCardName("Archive Sentry"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Synth",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "Nightmare is a Bane.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function model(displaySnapshot = card()): GameCardModel {
  return { cardId: CARD_ID, displaySnapshot };
}

function mount(element: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

function rect(width: number, left = 80, top = 120): DOMRect {
  const height = width * 1.5;
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

function pointer(type: string, init: PointerEventInit): Event {
  return new PointerEvent(type, { bubbles: true, ...init });
}

beforeEach(() => {
  vi.mocked(extractMaterializedFigmentPreviews).mockReset().mockReturnValue([]);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (query: string) => ({
    matches: query.includes("pointer: fine"), media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect(this: HTMLElement) {
    if (this.hasAttribute("data-game-card-source")) return rect(Number(this.parentElement?.dataset.testWidth ?? 160));
    if (this.getAttribute("data-reveal-measure") === "primary") return rect(240, 0, 0);
    if (this.getAttribute("data-reveal-measure") === "secondary") return rect(248, 0, 0);
    if (this.getAttribute("data-reveal-measure") === "adjacent") return rect(150, 0, 0);
    if (this.classList.contains("card-view")) return rect(160);
    return rect(100);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
});

function remeasure(): void {
  act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
}

describe("GameCard reveal contract", () => {
  it("registers canonical UUID semantics and derives de-duplicated glossary secondaries", () => {
    const { container, root } = mount(<GameCard model={model(card({ renderedText: "Nightmare is a Bane. The Bane keyword identifies Nightmare." }))} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    expect(source?.getAttribute("aria-describedby")).toMatch(/^cumulus-reveal-description-/);
    const description = document.querySelector("[data-cumulus-reveal-descriptions]")?.textContent ?? "";
    expect(description).toContain("Archive Sentry");
    expect(description).toContain("Nightmare is a Bane. The Bane keyword identifies Nightmare");
    const baneEntry = glossary.lookupGlossaryTerm("bane");
    if (baneEntry === undefined) throw new Error("Bane glossary fixture missing");
    expect(description.split(baneEntry.definition).length - 1).toBe(1);
    act(() => root.unmount());
  });

  it("omits ordinary Materialize and Void definitions while preserving the Materialized trigger", () => {
    const { container, root } = mount(
      <GameCard
        model={model(
          card({
            renderedText:
              "Materialize a figment from your void. ▸Materialized: Banish Nightmare.",
          }),
        )}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent ?? "";

    expect(description).not.toContain("Put a character into play");
    expect(description).not.toContain("Your discard pile");
    expect(description).toContain(
      glossary.requireGlossaryEntry("a70ebef7-797a-491b-a888-382a0d7a7656")
        .definition,
    );

    act(() => root.unmount());
  });

  it("renders contextual counts and grammar for every numeric card keyword", () => {
    const renderedText = "Erode 2. Foresee 1. Reclaim 0●.";
    const { container, root } = mount(
      <GameCard
        model={model(
          card({
            renderedText,
          }),
        )}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent ?? "";
    const numericGlossaryIds: readonly string[] = [
      glossary.GLOSSARY_IDS.erode,
      glossary.GLOSSARY_IDS.foresee,
      glossary.GLOSSARY_IDS.reclaim,
    ];
    const numericEntries = extractProjectedGlossaryTerms(renderedText).filter(
      (entry) => numericGlossaryIds.includes(entry.id),
    );

    expect(numericEntries.map((entry) => entry.id)).toEqual(
      numericGlossaryIds,
    );
    for (const entry of numericEntries) {
      expect(description).toContain(entry.term);
      expect(description).toContain(entry.definition);
    }

    act(() => root.unmount());
  });

  it("stacks the glossary-backed exhausted status before rules-text definitions", async () => {
    const { container, root } = mount(
      <GameCard
        model={model(card({ renderedText: "Nightmare is a Bane." }))}
        exhausted
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent ?? "";
    expect(description).toContain("Exhausted");
    expect(description).toContain(
      glossary.requireGlossaryEntry(glossary.GLOSSARY_IDS.exhausted).definition,
    );
    expect(description.indexOf("Exhausted")).toBeLessThan(
      description.indexOf(
        glossary.requireGlossaryEntry("a9799416-d2d4-4f1b-a3b5-fec790119fae")
          .definition,
      ),
    );

    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('[data-cumulus-reveal-card="secondary"]'),
      ).toHaveLength(2),
    );
    const secondaries = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-cumulus-reveal-card="secondary"]',
      ),
    ];
    expect(secondaries[0]?.textContent).toContain("Exhausted");
    expect(secondaries[0]?.querySelectorAll("i.bxf.bx-moon")).toHaveLength(2);
    expect(secondaries[1]?.textContent).toContain("Bane");

    act(() => root.unmount());
  });

  it("stacks the glossary-backed figment status before rules-text definitions", async () => {
    const { container, root } = mount(
      <GameCard
        model={model(card({ renderedText: "Nightmare is a Bane." }))}
        figment
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent ?? "";
    expect(description).toContain("Figment");
    expect(description).toContain(
      glossary.requireGlossaryEntry(glossary.GLOSSARY_IDS.figment).definition,
    );
    expect(description.indexOf("Figment")).toBeLessThan(
      description.indexOf(
        glossary.requireGlossaryEntry("a9799416-d2d4-4f1b-a3b5-fec790119fae")
          .definition,
      ),
    );

    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('[data-cumulus-reveal-card="secondary"]'),
      ).toHaveLength(2),
    );
    const secondaries = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-cumulus-reveal-card="secondary"]',
      ),
    ];
    expect(secondaries[0]?.textContent).toContain("Figment");
    expect(secondaries[1]?.textContent).toContain("Bane");

    act(() => root.unmount());
  });

  it("shows the Figment definition once when a figment's own rules text mentions figments", () => {
    const { container, root } = mount(
      <GameCard
        model={model(
          card({ renderedText: "Merge with another figment." }),
        )}
        figment
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent ?? "";
    const figmentDefinition = glossary.requireGlossaryEntry(
      glossary.GLOSSARY_IDS.figment,
    ).definition;

    expect(description.split(figmentDefinition).length - 1).toBe(1);

    act(() => root.unmount());
  });

  it.each([
    {
      label: "fast",
      cardData: { isFast: true, isInterrupt: false },
      glossaryId: glossary.GLOSSARY_IDS.fast,
      definition: "A fast (❖) card may be played at the end of either player's turn.",
      iconCount: 1,
    },
    {
      label: "interrupt",
      cardData: { isFast: true, isInterrupt: true },
      glossaryId: glossary.GLOSSARY_IDS.interrupt,
      definition: "An interrupt (❖❖) card may be played in response to an opponent action, or at the end of either player's turn.",
      iconCount: 2,
    },
  ])(
    "shows a separate title-free InfoCard with Boxicons for a $label card",
    async ({ label, cardData, glossaryId, definition, iconCount }) => {
      vi.spyOn(glossary, "glossaryEntry").mockImplementation((id) =>
        id === glossaryId
          ? {
              id,
              category: "Test",
              term: "Timing",
              definition,
              priority: 95,
              matchesTermInRulesText: false,
              variants: [label === "fast" ? "❖" : "❖❖"],
              termPresentation: "definitionOnly",
            }
          : undefined,
      );
      const { container, root } = mount(
        <GameCard
          model={model(card({ ...cardData, renderedText: "" }))}
        />,
      );
      const source = container.querySelector<HTMLElement>(
        "[data-game-card-source]",
      );

      act(() => {
        source?.dispatchEvent(
          pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      remeasure();

      await vi.waitFor(() =>
        expect(
          document.querySelectorAll('[data-cumulus-reveal-card="secondary"]'),
        ).toHaveLength(1),
      );
      const timingCard = document.querySelector<HTMLElement>(
        '[data-cumulus-reveal-card="secondary"]',
      );
      expect(timingCard?.textContent).toContain("card may be played");
      expect(timingCard?.textContent).not.toContain("Timing");
      expect(timingCard?.querySelectorAll("i.bxf.bx-bolt")).toHaveLength(
        iconCount,
      );
      expect(timingCard?.textContent).not.toContain("❖");

      act(() => root.unmount());
    },
  );

  it.each([
    {
      label: "fast",
      renderedText: "❖ – Draw a card.",
      definition:
        "A fast (❖) ability may be activated at the end of either player's turn.",
      iconCount: 1,
    },
    {
      label: "interrupt",
      renderedText: "❖❖ – Draw a card.",
      definition:
        "An interrupt (❖❖) ability may be activated in response to an opponent action, or at the end of either player's turn.",
      iconCount: 2,
    },
  ])(
    "describes a $label rules-text marker as an ability",
    async ({ renderedText, definition, iconCount }) => {
      const { container, root } = mount(
        <GameCard model={model(card({ renderedText }))} />,
      );
      const source = container.querySelector<HTMLElement>(
        "[data-game-card-source]",
      );

      act(() => {
        source?.dispatchEvent(
          pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      remeasure();

      await vi.waitFor(() =>
        expect(
          document.querySelectorAll('[data-cumulus-reveal-card="secondary"]'),
        ).toHaveLength(1),
      );
      const timingCard = document.querySelector<HTMLElement>(
        '[data-cumulus-reveal-card="secondary"]',
      );
      expect(timingCard?.textContent).toContain(
        definition.replace(/❖/gu, ""),
      );
      expect(timingCard?.textContent).not.toContain("card may be played");
      expect(timingCard?.querySelectorAll("i.bxf.bx-bolt")).toHaveLength(
        iconCount,
      );

      act(() => root.unmount());
    },
  );

  it("keeps the card interactive when its exhausted glossary entry is unavailable", () => {
    vi.spyOn(glossary, "glossaryEntry").mockReturnValue(undefined);
    const { container, root } = mount(
      <GameCard
        model={model(card({ renderedText: "Nightmare is a Bane." }))}
        exhausted
      />,
    );

    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent ?? "";
    expect(source).not.toBeNull();
    expect(description).toContain("Rule definition unavailable");
    expect(description).toContain(
      "This rule's definition is temporarily unavailable.",
    );

    act(() => root.unmount());
  });

  it("shows an authored figment card beyond glossary definitions on desktop", async () => {
    vi.mocked(extractMaterializedFigmentPreviews).mockReturnValue([{
      card: Object.freeze({
        id: asCardId("bb1a5acd-1a03-4aa3-826d-f0a301843845"),
        name: asCardName("Legionnaire"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "Warrior",
        isStarter: false,
        energyCost: 0,
        spark: 1,
        isFast: false,
        renderedText: "This character has +1✦ for each other warrior you control.",
        imageNumber: 436090582,
        artOwned: false,
        art: { x: 0, y: 0.123, scale: 1.2 },
      }),
    }]);
    const { container, root } = mount(
      <div data-test-width="240">
        <GameCard
          model={model(card({
            renderedText: "Nightmare is a Bane. Materialize a 1✦ warrior figment.",
          }))}
        />
      </div>,
    );
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-cumulus-reveal-card="adjacent"]')).not.toBeNull(),
    );
    const definition = document.querySelector<HTMLElement>(
      '[data-cumulus-reveal-card="secondary"]',
    );
    const figment = document.querySelector<HTMLElement>(
      '[data-cumulus-reveal-card="adjacent"]',
    );
    expect(figment?.style.width).toBe("150px");
    expect(figment?.querySelector("[data-cumulus-reveal-adjacent-label]")).toBeNull();
    const figmentCard = figment?.querySelector<HTMLElement>(
      '[data-card-id="bb1a5acd-1a03-4aa3-826d-f0a301843845"]',
    );
    expect(figmentCard?.getAttribute("data-figment")).toBe("true");
    expect(
      figmentCard?.getAttribute("data-card-rules-text-presentation"),
    ).toBe("adjacent-figment");
    expect(figmentCard?.style.boxShadow).toContain(
      "0 0 0 3px var(--accent-bright)",
    );
    expect(figmentCard?.style.boxShadow).toContain(
      "0 0 12px var(--accent-bright)",
    );
    expect(
      figment?.querySelector("[data-testid=figment-title-bar]")?.textContent,
    ).toContain("Legionnaire Figment");
    const sourceRulesFont = container
      .querySelector<HTMLElement>("[data-card-rules-text]")
      ?.style.fontSize.match(/([0-9.]+)px/u)?.[1];
    const figmentRulesFont = figment
      ?.querySelector<HTMLElement>("[data-card-rules-text]")
      ?.style.fontSize.match(/([0-9.]+)px/u)?.[1];
    expect(Number(figmentRulesFont)).toBeCloseTo(Number(sourceRulesFont) * 1.5);
    expect(Number.parseFloat(figment!.style.left)).toBe(
      Number.parseFloat(definition!.style.left)
        + Number.parseFloat(definition!.style.width)
        + 10,
    );
    act(() => root.unmount());
  });

  it("uses a reading copy below 240px and leaves a complete 240px source in place", async () => {
    const small = mount(<div data-test-width="239"><GameCard model={model()} /></div>);
    const smallSource = small.container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { smallSource?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 1 })); });
    expect(smallSource?.dataset.revealActive).toBe("true");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    expect(smallSource?.style.opacity).toBe("0");
    expect(document.querySelector<HTMLElement>('[data-cumulus-reveal-card="primary"]')?.style.width).toBe("240px");
    act(() => small.root.unmount());

    const wide = mount(<div data-test-width="240"><GameCard model={model()} /></div>);
    const wideSource = wide.container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { wideSource?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 2 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-cumulus-reveal-card="secondary"]')).toHaveLength(1));
    expect(wideSource?.style.opacity).not.toBe("0");
    expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).toBeNull();
    expect(document.querySelectorAll('[data-cumulus-reveal-card="secondary"]')).toHaveLength(1);
    act(() => wide.root.unmount());
  });

  it("scales the desktop reading copy for a hovered battle hand card", async () => {
    const { container, root } = mount(
      <div data-test-width="160" data-battle-hand-card-hover-scale="1.25">
        <GameCard model={model()} />
      </div>,
    );
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { source?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    expect(document.querySelector<HTMLElement>('[data-cumulus-reveal-card="primary"]')?.style.width).toBe("300px");
    act(() => root.unmount());
  });

  it("keeps hidden-rules cards eligible for a complete popup", async () => {
    const { container, root } = mount(<GameCard model={model()} hideRulesText />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    expect(source?.dataset.revealCompleteGameCard).toBe("false");
    act(() => { source?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    expect(document.querySelector('[data-cumulus-reveal-card="primary"]')?.textContent).toContain("Nightmare is a Bane");
    act(() => root.unmount());
  });

  it("renders the battlefield face as art and enlarged spark while revealing the complete card", async () => {
    const { container, root } = mount(
      <GameCard model={model()} presentation="battlefield" />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const surface = source?.querySelector<HTMLElement>(".card-view");
    const spark = surface?.querySelector<HTMLElement>(
      '[data-card-stat="spark"]',
    );

    expect(source?.dataset.revealCompleteGameCard).toBe("false");
    expect(source?.dataset.gameCardPresentation).toBe("battlefield");
    expect(surface?.dataset.cardPresentation).toBe("battlefield");
    expect(surface?.style.aspectRatio).toBe("1 / 1");
    expect(surface?.style.borderRadius).toBe("var(--cv-radius)");
    expect(surface?.style.getPropertyValue("--cv-radius")).toBe("3.6%");
    expect(
      surface?.querySelector("[data-card-stat-value]")?.textContent,
    ).toBe("3");
    expect(surface?.querySelector('[data-card-energy-anchor]')).toBeNull();
    expect(surface?.querySelector('[data-testid="card-type-line"]')).toBeNull();
    expect(spark?.style.width).toBe(
      "calc(var(--cv-spark-orb-size) * 2.5)",
    );
    expect(spark?.style.height).toBe(
      "calc(var(--cv-spark-orb-size) * 2.5)",
    );

    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    const reveal = document.querySelector<HTMLElement>(
      '[data-cumulus-reveal-card="primary"]',
    );
    expect(source?.style.opacity).not.toBe("0");
    expect(source?.style.transform).toBe("none");
    expect(reveal?.style.top).toBe("0px");
    expect(reveal?.style.left).toBe("254px");
    expect(reveal?.textContent).toContain("Archive Sentry");
    expect(reveal?.textContent).toContain("Synth");
    expect(reveal?.textContent).toContain("Nightmare is a Bane");
    expect(reveal?.querySelector('[data-card-energy-anchor]')).not.toBeNull();

    act(() => root.unmount());
  });

  it("uses the card's primary reveal when hovering a corner stat", async () => {
    const { container, root } = mount(<GameCard model={model()} />);
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const spark = source?.querySelector<HTMLElement>(
      '[data-card-stat="spark"]',
    );

    expect(spark?.closest("[data-reveal-entity-type]")).toBe(source);

    act(() => {
      spark?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();

    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector('[data-cumulus-reveal-card="primary"]')?.textContent,
    ).toContain("Archive Sentry");

    act(() => root.unmount());
  });

  it.each(["full", "battlefield"] as const)(
    "snaps the %s card back to its original size when a press ends",
    (presentation) => {
      const { container, root } = mount(
        <GameCard model={model()} presentation={presentation} />,
      );
      const source = container.querySelector<HTMLElement>(
        "[data-game-card-source]",
      );
      if (!source) throw new Error("missing game card source");

      act(() => {
        source.dispatchEvent(
          pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
        );
        source.dispatchEvent(
          pointer("pointerdown", {
            pointerType: "mouse",
            pointerId: 1,
            button: 0,
          }),
        );
      });
      expect(source.style.transform).toContain("scale(");

      act(() => {
        source.dispatchEvent(
          pointer("pointerup", {
            pointerType: "mouse",
            pointerId: 1,
            button: 0,
          }),
        );
      });
      expect(source.style.transform).toBe("none");
      expect(source.style.transition).toBe("none");

      act(() => root.unmount());
    },
  );

  it("widens the battlefield art viewport without increasing its vertical crop", () => {
    const displaySnapshot = card({
      art: { x: 0, y: 0, scale: 1.3 },
    });
    const full = mount(<GameCard model={model(displaySnapshot)} />);
    const battlefield = mount(
      <GameCard model={model(displaySnapshot)} presentation="battlefield" />,
    );
    const fullImage = full.container.querySelector<HTMLImageElement>(
      'img[alt="Archive Sentry"]',
    );
    const battlefieldImage =
      battlefield.container.querySelector<HTMLImageElement>(
        'img[alt="Archive Sentry"]',
      );

    for (const image of [fullImage, battlefieldImage]) {
      Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 462 },
        naturalHeight: { configurable: true, value: 280 },
      });
      act(() => {
        image?.dispatchEvent(new Event("load", { bubbles: true }));
      });
    }

    expect(battlefieldImage?.style.height).toBe(fullImage?.style.height);
    expect(Number.parseFloat(battlefieldImage?.style.width ?? "Infinity")).toBeLessThan(
      Number.parseFloat(fullImage?.style.width ?? "0"),
    );

    act(() => {
      full.root.unmount();
      battlefield.root.unmount();
    });
  });

  it("renders an applied proposed transfiguration on the reading copy", async () => {
    const displaySnapshot = card({ energyCost: 1 });
    const { container, root } = mount(
      <GameCard
        model={{
          cardId: CARD_ID,
          displaySnapshot,
          transfiguration: {
            type: "Empowered",
            form: transfigurationFormFixture("Empowered"),
            markedText: displaySnapshot.renderedText,
            energyChanged: true,
            energyChangeName: "Fixture energy form",
            sparkChanged: false,
            sparkChangeName: null,
            fastChanged: false,
          },
        }}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector(
        '[data-cumulus-reveal-card="primary"] i[aria-label]',
      ),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("carries the selected source ring onto the reading copy", async () => {
    const { container, root } = mount(
      <GameCard model={model()} selection="copied" />,
    );
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector<HTMLElement>(
        '[data-cumulus-reveal-card="primary"] .card-view',
      )?.style.boxShadow,
    ).toContain("var(--accent)");
    act(() => root.unmount());
  });

  it("carries the figment frame and title bar onto the reading copy", async () => {
    const { container, root } = mount(
      <GameCard model={model()} figment />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector(
        '[data-cumulus-reveal-card="primary"] .card-view[data-figment="true"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-cumulus-reveal-card="primary"] [data-testid="figment-title-bar"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '[data-cumulus-reveal-card="primary"] .card-view',
      )?.style.boxShadow,
    ).not.toContain("var(--accent-bright)");
    expect(
      document.querySelector(
        '[data-cumulus-reveal-card="primary"] [data-testid="figment-title-bar"]',
      )?.textContent,
    ).toContain("Archive Sentry Figment");
    act(() => root.unmount());
  });

  it("keeps informative unavailable cards focusable while suppressing activation", async () => {
    const activate = vi.fn();
    const { container, root } = mount(<GameCard model={model()} unavailable onPress={activate} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    expect(source?.tabIndex).toBe(0);
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    act(() => source?.click());
    expect(activate).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("fires quick activation, suppresses a hold, and dismisses on drag recognition", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const { container, root } = mount(<GameCard model={model()} onPress={activate} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { source?.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 4, clientX: 100, clientY: 200 })); });
    act(() => { source?.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 4, clientX: 100, clientY: 200 })); });
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      source?.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 5, clientX: 100, clientY: 200 }));
      vi.advanceTimersByTime(300);
      source?.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 5, clientX: 100, clientY: 200 }));
    });
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      source?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 6 }));
      source?.dispatchEvent(new Event("dragstart", { bubbles: true }));
    });
    expect(document.querySelector('[data-cumulus-reveal-group]')).toBeNull();
    act(() => root.unmount());
  });
});
