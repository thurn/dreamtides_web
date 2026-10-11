// @vitest-environment jsdom

// CardView: chrome, glossary Info Cards, text fit, and the transfiguration
// rules marker.
import { act } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../../../runtime/transfigure-markers";
import { parseCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { transfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";
import { renderInCumulus } from "../../testing/render";
import { CardView } from "./CardView";
import { CARD_ID, KEYWORD, describedText } from "./card-components.fixtures";

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: CARD_ID,
    name: parseCardName("Archive Sentry"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Synth",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "Draw two cards.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

describe("CardView", () => {
  it("renders card chrome without mounting an independent reveal portal", () => {
    const { container } = renderInCumulus(<CardView card={card()} />);
    expect(container.querySelector(".card-view")).not.toBeNull();
    expect(container.querySelector("[data-card-rules-box]")).not.toBeNull();
    expect(document.querySelector("[data-hover-zoom-overlay]")).toBeNull();
    expect(document.querySelector("[role='tooltip']")).toBeNull();
  });

  it("registers glossary Info Cards only when the editor variant is enabled", () => {
    const renderedText = `${KEYWORD.term} this card.`;
    const { container, rerender } = renderInCumulus(
      <CardView card={card({ renderedText })} />,
    );
    expect(
      container.querySelector("[data-card-view-glossary-hover-source]"),
    ).toBeNull();

    rerender(<CardView glossaryInfoOnHover card={card({ renderedText })} />);
    const source = container.querySelector(
      "[data-card-view-glossary-hover-source]",
    );
    const description = describedText(source);
    for (const term of extractGlossaryTerms(renderedText)) {
      expect(description).toContain(term.definition);
    }
  });

  describe("text fit", () => {
    /**
     * Gives every card root a layout width of `widthPx` and counts the fit
     * probes per text element: each fit reads the element's `scrollHeight`,
     * once in jsdom, where everything fits at the ceiling.
     */
    function measureCards(widthPx: number): Map<Element, number> {
      vi.restoreAllMocks();
      onTestFinished(() => {
        vi.restoreAllMocks();
      });
      const probes = new Map<Element, number>();
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
        function (this: HTMLElement) {
          return this.classList.contains("card-view") ? widthPx : 0;
        },
      );
      vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(
        function (this: Element) {
          probes.set(this, (probes.get(this) ?? 0) + 1);
          return 0;
        },
      );
      return probes;
    }

    function fitCounts(
      container: HTMLElement,
      probes: Map<Element, number>,
    ): number[] {
      return Array.from(
        container.querySelectorAll(
          "[data-card-rules-text], [data-card-stat-value]",
        ),
        (element) => probes.get(element) ?? 0,
      );
    }

    function withFonts(fonts: Pick<FontFaceSet, "ready" | "status">): void {
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: fonts,
      });
      onTestFinished(() => {
        Reflect.deleteProperty(document, "fonts");
      });
    }

    it("fits the rules text and stat digits once per mount, at the measured width", () => {
      const probes = measureCards(300);
      const fontSizes: number[] = [];
      const { container } = renderInCumulus(
        <CardView
          card={card()}
          onRulesFontSizeChange={(px) => fontSizes.push(px)}
        />,
      );
      // Rules text, energy digit, spark digit.
      expect(fitCounts(container, probes)).toEqual([1, 1, 1]);

      measureCards(150);
      const halfSizes: number[] = [];
      renderInCumulus(
        <CardView
          card={card()}
          onRulesFontSizeChange={(px) => halfSizes.push(px)}
        />,
      );
      expect(
        (fontSizes[fontSizes.length - 1] ?? 0) /
          (halfSizes[halfSizes.length - 1] ?? 1),
      ).toBeCloseTo(2);
    });

    it("re-fits after the web fonts load only when a font was loading", async () => {
      let fontsLoaded = () => {};
      withFonts({
        status: "loading",
        ready: new Promise<FontFaceSet>((resolve) => {
          fontsLoaded = () => resolve(document.fonts);
        }),
      });
      const probes = measureCards(300);
      const { container } = renderInCumulus(<CardView card={card()} />);
      expect(fitCounts(container, probes)).toEqual([1, 1, 1]);
      await act(async () => {
        fontsLoaded();
        await Promise.resolve();
      });
      expect(fitCounts(container, probes)).toEqual([2, 2, 2]);

      const loadedProbes = measureCards(300);
      withFonts({ status: "loaded", ready: Promise.resolve(document.fonts) });
      const loaded = renderInCumulus(<CardView card={card()} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(fitCounts(loaded.container, loadedProbes)).toEqual([1, 1, 1]);
    });
  });

  describe("transfiguration rules marker", () => {
    function display(markedText: string): CardTransfigurationDisplay {
      return {
        type: "Amplified",
        form: transfigurationFormFixture("Amplified"),
        markedText,
        energyChanged: false,
        energyChangeName: null,
        sparkChanged: false,
        sparkChangeName: null,
        fastChanged: false,
      };
    }
    const MARKED = `Draw ${TRANSFIGURE_MARK_START}two${TRANSFIGURE_MARK_END} cards.`;

    it("shows a labelled change badge only when the rules text changes", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const { container, rerender } = renderInCumulus(
        <CardView card={card()} transfiguration={display(card().renderedText)} />,
      );
      expect(
        container.querySelector("[data-card-rules-text-change]"),
      ).toBeNull();

      // Swapping to a rules-changing form must not change hook order.
      rerender(<CardView card={card()} transfiguration={display(MARKED)} />);
      const badge = container.querySelector(
        '[data-card-rules-text-change="Amplified"] [role="img"]',
      );
      expect(badge?.getAttribute("aria-label")?.trim()).not.toBe("");
      expect(
        consoleError.mock.calls.some((call) =>
          call.some(
            (value) =>
              typeof value === "string" &&
              value.includes("change in the order of Hooks"),
          ),
        ),
      ).toBe(false);
      consoleError.mockRestore();
    });
  });
});
