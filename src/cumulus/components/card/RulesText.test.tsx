// @vitest-environment jsdom

// RulesText: rules symbols, ability paragraphs, and the reveal source.
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { GlossaryCatalogEntry } from "../../../data/glossary";
import { testGlossaryEntryId } from "../../../types/test-identities";
import { renderInCumulus } from "../../testing/render";
import { renderRulesSymbolsInline, RulesText } from "./RulesText";
import { CARD_ID, KEYWORD, describedText } from "./card-components.fixtures";

const CARD_OWNER = { kind: "card", id: CARD_ID } as const;

/** Visible rules copy, excluding the hidden accessible descriptions. */
function paragraphText(container: HTMLElement): string {
  return Array.from(
    container.querySelectorAll("[data-rules-text-paragraph]"),
    (paragraph) => paragraph.textContent,
  ).join("");
}

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
        {renderRulesSymbolsInline("⍟", { rulesSymbolResolver: () => entry })}
      </div>,
    );

    expect(
      container
        .querySelector("[data-inline-glyph]")
        ?.getAttribute("aria-label"),
    ).toBe(entry.rulesSymbol?.accessibleLabel);
  });

  it("renders rules symbols as glyphs inside one reveal source", () => {
    const { container } = renderInCumulus(
      <RulesText text={"Pay ●3. Gain 2⍟. ☾: Store 1⧗."} owner={CARD_OWNER} />,
    );

    const text = paragraphText(container);
    for (const raw of ["●", "⍟", "☾", "⧗"]) {
      expect(text).not.toContain(raw);
    }
    expect(
      container.querySelectorAll("[data-inline-glyph]").length,
    ).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll("[data-glossary-term]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-rules-text-source]")).toHaveLength(
      1,
    );
  });

  it("renders ❖ as one bolt and ❖❖ as two", () => {
    for (const [marker, count] of [
      ["❖", 1],
      ["❖❖", 2],
    ] as const) {
      const { container, unmount } = renderInCumulus(
        <RulesText text={`${marker} – Effect.`} owner={CARD_OWNER} />,
      );
      expect(container.querySelectorAll("i.bx-bolt")).toHaveLength(count);
      expect(paragraphText(container)).not.toContain("❖");
      unmount();
    }
  });

  it("renders each blank-line separated ability as its own paragraph", () => {
    const { container, rerender } = renderInCumulus(
      <RulesText text={"Ability one.\n\nAbility two."} owner={CARD_OWNER} />,
    );
    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(Array.from(paragraphs, (p) => p.textContent)).toEqual([
      "Ability one.",
      "Ability two.",
    ]);

    rerender(<RulesText text={"Ability one."} owner={CARD_OWNER} />);
    expect(
      container.querySelectorAll("[data-rules-text-paragraph]"),
    ).toHaveLength(1);
  });

  it("makes the whole block one focusable stationary source with a description", () => {
    const { container } = renderInCumulus(
      <RulesText text={`${KEYWORD.term} 2● and 3✦.`} owner={CARD_OWNER} />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-rules-text-source]",
    );
    expect(container.querySelector("[data-glossary-term]")).toBeNull();
    expect(source?.dataset.revealFeedback).toBe("stationary");
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    expect(describedText(source)).not.toBe("");
  });

  it("renders passive copy when an outer entity owns glossary interaction", () => {
    const { container } = renderInCumulus(
      <RulesText
        text={`${KEYWORD.term} 2●.`}
        owner={CARD_OWNER}
        glossaryInteraction="delegated"
      />,
    );
    expect(container.querySelector("[data-rules-text-source]")).toBeNull();
    expect(container.querySelector("[data-inline-glyph]")).not.toBeNull();
  });
});
