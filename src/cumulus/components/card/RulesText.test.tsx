// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { ENERGY_ICON_COLOR } from "../controls/StandaloneGlyph";
import type { GlossaryCatalogEntry } from "../../../data/glossary";
import { renderRulesSymbolsInline, RulesText } from "./RulesText";
import { testCardId, testGlossaryEntryId } from "../../../types/test-identities";
import { renderInCumulus } from "../../testing/render";

const CARD_OWNER = {
  kind: "card",
  id: testCardId("11111111-1111-4111-8111-111111111111"),
} as const;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RulesText", () => {
  it("renders a symbol's accessible name from injected glossary metadata", () => {
    const entry: GlossaryCatalogEntry = {
      id: testGlossaryEntryId("fixture-symbol"),
      category: "Resources",
      term: "Fixture",
      definition: "Fixture definition.",
      priority: 0,
      matchesTermInRulesText: false,
      variants: [],
      projections: [],
      rulesSymbol: {
        token: "points",
        glyph: "points",
        accessibleLabel: "Synthetic accessible symbol",
      },
    };
    const { container } = renderInCumulus(
      <div>
        {renderRulesSymbolsInline("⍟", {
          rulesSymbolResolver: () => entry,
        })}
      </div>,
    );

    expect(
      container
        .querySelector("[data-inline-glyph]")
        ?.getAttribute("aria-label"),
    ).toBe(entry.rulesSymbol?.accessibleLabel);
  });

  it("renders recognized glossary terms as plain text without an underline", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"Reclaim this card."}
        owner={CARD_OWNER}
      />,
    );

    // The "Reclaim" word renders as plain prose; its definition surfaces in the
    // card's hover-help panel rather than as a per-word underline/tooltip.
    const allSpans = container.querySelectorAll("span");
    const reclaimSpan = Array.from(allSpans).find(
      (s) => s.textContent === "Reclaim",
    );
    expect(reclaimSpan).toBeDefined();
    expect(reclaimSpan?.getAttribute("style") ?? "").not.toContain(
      "text-decoration",
    );
  });

  it("renders the energy glyph as the boxicons fire-alt icon", () => {
    const { container } = renderInCumulus(
      <RulesText text={"Pay ●3."} owner={CARD_OWNER} />,
    );

    const flame = container.querySelector("i.bxf.bx-fire-alt");
    expect(flame).not.toBeNull();
    expect(container.textContent).not.toContain("●");
  });

  // Backlog task 001: the inline energy flame inside rules text reads in the
  // same teal as the corner energy-cost glyph (`ENERGY_ICON_COLOR`). They
  // represent the same resource at two anchors on the card and must read as
  // unified at normal viewing distance. The flame color is a CSS var so a
  // light-box surface (the figment frame) can override it, with the shared
  // constant as the fallback everywhere else, so the two cannot drift apart.
  it("colors the inline energy flame with ENERGY_ICON_COLOR", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"Pay ●2 to draw a card."}
        owner={CARD_OWNER}
      />,
    );

    const flame = container.querySelector<HTMLElement>("i.bxf.bx-fire-alt");
    expect(flame).not.toBeNull();
    const style =
      flame
        ?.closest<HTMLElement>("[data-inline-glyph]")
        ?.parentElement?.getAttribute("style") ?? "";
    // The color is a var whose fallback is ENERGY_ICON_COLOR, so a card outside a
    // figment renders the flame in the energy teal.
    expect(style.toLowerCase()).toContain("var(--cv-rules-energy-color");
    expect(style.toLowerCase()).toContain(ENERGY_ICON_COLOR.toLowerCase());
    // Sanity-check ENERGY_ICON_COLOR itself: if the shared token ever
    // changes hex value, this assertion makes the change explicit.
    expect(ENERGY_ICON_COLOR.toLowerCase()).toBe("#0ea5e9");
    // Guard against regression to the previous gold/amber fill `#fbbf24`.
    expect(style.toLowerCase()).not.toContain("#fbbf24");
  });

  // The fast marker `❖` renders as the filled lightning bolt (the same
  // `bxf bx-bolt` mark the title bar shows before the card name), not the
  // literal diamond character.
  it("renders the fast marker ❖ as one boxicons bolt icon", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"❖ – 1●: Move this character."}
        owner={CARD_OWNER}
      />,
    );

    const bolts = container.querySelectorAll("i.bxf.bx-bolt");
    expect(bolts).toHaveLength(1);
    expect(
      container.querySelector("[data-rules-text-paragraph]")?.textContent,
    ).not.toContain("❖");
  });

  // The interrupt marker `❖❖` renders as two bolts so it reads the same as the
  // double-bolt interrupt chip in the title bar.
  it("renders the interrupt marker ❖❖ as two bolt icons", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"❖❖ – Abandon an ally: Effect."}
        owner={CARD_OWNER}
      />,
    );

    const bolts = container.querySelectorAll("i.bxf.bx-bolt");
    expect(bolts).toHaveLength(2);
    expect(
      container.querySelector("[data-rules-text-paragraph]")?.textContent,
    ).not.toContain("❖");
  });

  it("does not wrap unknown words", () => {
    const { container } = renderInCumulus(
      <RulesText text={"Deal 3 damage."} owner={CARD_OWNER} />,
    );

    const triggerSpans = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.getAttribute("style")?.includes("text-decoration") === true,
    );
    expect(triggerSpans).toHaveLength(0);
  });

  it("keeps the trigger keyword on one line and renders it as plain text", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"▸ Judgment: Draw a card."}
        owner={CARD_OWNER}
      />,
    );

    // The Judgment keyword renders as plain prose (no per-word underline).
    const judgmentSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "Judgment",
    );
    expect(judgmentSpan).toBeDefined();
    expect(judgmentSpan?.getAttribute("style") ?? "").not.toContain(
      "text-decoration",
    );

    // The arrow + keyword still sit inside a nowrap group so they never wrap
    // apart across a line break.
    const nowrapGroup = Array.from(container.querySelectorAll("span")).some(
      (s) =>
        (s.getAttribute("style") ?? "").includes("nowrap") &&
        s.textContent?.includes("Judgment") === true,
    );
    expect(nowrapGroup).toBe(true);
  });

  it("renders ▸ as compact Unicode text that inherits the surrounding style", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"▸ Judgment: Draw a card."}
        owner={CARD_OWNER}
      />,
    );

    expect(container.querySelector("i.bxf.bx-caret-right")).toBeNull();
    expect(container.textContent).toContain("▸Judgment: Draw a card.");
    const arrowSpan = Array.from(container.querySelectorAll("span")).find(
      (span) => span.textContent === "▸",
    );
    expect(arrowSpan).toBeDefined();
    expect(arrowSpan?.getAttribute("style")).toBeNull();
    expect(arrowSpan?.className).toBe("");
  });

  // The points `⍟`, lunar `☾`, and memory `⧗` glyphs each swap for their filled
  // icon-font mark rather than printing the literal character.
  it("renders points ⍟, lunar ☾, and memory ⧗ as filled marks", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"Gain 2⍟. ☾: Store 1⧗."}
        owner={CARD_OWNER}
      />,
    );

    expect(container.querySelector("i.bxf.bx-star-circle")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-moon")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-brain")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-hourglass")).toBeNull();
    const renderedRules = container.querySelector(
      "[data-rules-text-paragraph]",
    );
    expect(renderedRules?.textContent).not.toContain("☾");
    expect(renderedRules?.textContent).not.toContain("⧗");

    expect(container.querySelectorAll("[data-glossary-term]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-rules-text-source]")).toHaveLength(
      1,
    );
  });

  // Backlog task 029: cards with multiple abilities use a blank-line `\n\n`
  // separator in the card catalog. Each ability must render as its own block
  // with a visible vertical gap so adjacent abilities do not run together.
  it("renders each ability separated by `\\n\\n` as its own paragraph block", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"▸ Materialized: Banish an enemy until this character leaves play.\n\nAbandon this character: Foresee 2."}
        owner={CARD_OWNER}
      />,
    );

    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toContain("Materialized");
    expect(paragraphs[1]?.textContent).toContain("Abandon this character");
  });

  // The gap between abilities is set via `margin-top` (em-based) on every
  // paragraph after the first, so the spacing scales with the surrounding
  // font size (small card vs. large card).
  it("applies a top-margin to non-first ability paragraphs", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"Ability one.\n\nAbility two."}
        owner={CARD_OWNER}
      />,
    );

    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(paragraphs).toHaveLength(2);

    const firstStyle = paragraphs[0]?.getAttribute("style") ?? "";
    const secondStyle = paragraphs[1]?.getAttribute("style") ?? "";

    // First paragraph: no top margin.
    expect(firstStyle).not.toContain("margin-top");
    // Second paragraph: top margin in em so it scales with font size.
    expect(secondStyle).toContain("margin-top");
    expect(secondStyle).toContain("em");
  });

  // Single-ability cards keep one paragraph and no inter-ability gap.
  it("renders a single ability as one paragraph with no extra spacing", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={"▸ Materialized: Foresee 1."}
        owner={CARD_OWNER}
      />,
    );

    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.getAttribute("style") ?? "").not.toContain(
      "margin-top",
    );
  });
});
