// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GLOSSARY,
  glossaryRulesTextForms,
  type GlossaryCatalogEntry,
} from "../../../data/glossary";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../../../runtime/transfigure-markers";
import { parseCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { parseDeckEntryId } from "../../../types/identifiers";
import {
  testCardId,
  testDreamsignId,
  testGlossaryEntryId,
} from "../../../types/test-identities";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { transfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";
import { renderInCumulus } from "../../testing/render";
import { CardChangePair } from "./CardChangePair";
import { CardStatOrb } from "./CardStatOrb";
import { CardView } from "./CardView";
import { GlossaryTerm } from "./GlossaryTerm";
import { PlayingCard, PlayingCardPrize } from "./PlayingCard";
import { renderRulesSymbolsInline, RulesText } from "./RulesText";

const CARD_ID = testCardId("11111111-1111-4111-8111-111111111111");
const CARD_OWNER = { kind: "card", id: CARD_ID } as const;
// A live glossary keyword the tokenizer recognizes as written, so the rules
// text tests track the data instead of hardcoding a name.
const KEYWORD = GLOSSARY.find(
  (entry) =>
    /^[A-Za-z]+$/.test(entry.term) &&
    glossaryRulesTextForms(entry).includes(entry.term),
)!;

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

function describedText(source: Element | null | undefined): string {
  return (
    document.getElementById(source?.getAttribute("aria-describedby") ?? "")
      ?.textContent ?? ""
  );
}

/** Visible rules copy, excluding the hidden accessible descriptions. */
function paragraphText(container: HTMLElement): string {
  return Array.from(
    container.querySelectorAll("[data-rules-text-paragraph]"),
    (paragraph) => paragraph.textContent,
  ).join("");
}

const originalMatchMedia = window.matchMedia.bind(window);

afterEach(() => {
  window.matchMedia = originalMatchMedia;
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

describe("GlossaryTerm", () => {
  const entry = {
    term: "Lumenstep",
    definition: "Move through a fixed semantic fixture.",
  };

  it("registers stationary inline definition semantics without changing sentence flow", () => {
    const { container } = renderInCumulus(
      <p>
        Before <GlossaryTerm entry={entry} text={"lumensteps"} /> after.
      </p>,
    );
    const source = container.querySelector<HTMLElement>("[data-glossary-term]");
    expect(container.querySelector("p")?.textContent).toBe(
      "Before lumensteps after.",
    );
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.dataset.revealEntityType).toBe("glossary-term");
    expect(source?.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(describedText(source)).toContain(entry.definition);

    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
  });
});

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

describe("CardStatOrb", () => {
  function orb(changed: boolean, ariaLabel?: string) {
    return (
      <CardStatOrb
        variant="energy"
        value="12"
        sizeVar="60px"
        numberSizeVar="45px"
        numberCapPx={45}
        changeBadge={
          changed
            ? { kind: "empowered", accessibleName: "Synthetic form" }
            : undefined
        }
        ariaLabel={ariaLabel}
      />
    );
  }

  function labelRefs(container: HTMLElement): string[] {
    return (
      container
        .querySelector("[data-card-stat]")
        ?.getAttribute("aria-labelledby")
        ?.split(" ") ?? []
    );
  }

  it("announces the value and its change badge through existing labels", () => {
    const { container, rerender } = renderInCumulus(
      orb(false, "Custom stat context"),
    );
    expect(labelRefs(container)).toHaveLength(1);

    rerender(orb(true, "Custom stat context"));
    const ids = labelRefs(container);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => document.getElementById(id) !== null)).toBe(true);
    expect(
      container.querySelector('[data-card-stat-change="empowered"]'),
    ).not.toBeNull();
  });
});

describe("CardChangePair", () => {
  function pair(
    kind: "replacement" | "copy" | "transfiguration" | "keyword",
    reveal: "before" | "complete",
  ) {
    return (
      <CardChangePair
        model={{
          changeId: kind,
          kind,
          before: {
            entryId: parseDeckEntryId("entry-before"),
            card: syntheticGameCard(1, "Duplicate"),
          },
          after: {
            entryId: parseDeckEntryId("entry-after"),
            card: syntheticGameCard(2, "Duplicate"),
          },
        }}
        reveal={reveal}
      />
    );
  }

  it("preserves entry and card identities and marks each face by change kind", () => {
    for (const [kind, before, after] of [
      ["replacement", "danger", "changed"],
      ["copy", "none", "copied"],
      ["transfiguration", "none", "transfigured"],
    ] as const) {
      const { container, unmount } = renderInCumulus(pair(kind, "complete"));
      const root = container.querySelector<HTMLElement>(
        "[data-card-change-pair]",
      );
      expect(root?.dataset.beforeEntryId).toBe("entry-before");
      expect(root?.dataset.afterEntryId).toBe("entry-after");
      expect(root?.dataset.beforeCardId).not.toBe(root?.dataset.afterCardId);
      expect(root?.dataset.cardChangeKind).toBe(kind);
      const face = (side: string) =>
        container.querySelector<HTMLElement>(`[data-card-change-face="${side}"]`)
          ?.dataset.cardChangeSelection;
      expect(face("before")).toBe(before);
      expect(face("after")).toBe(after);
      unmount();
    }
  });

  it("conceals the result in the before phase unless motion is reduced", () => {
    const { container, unmount } = renderInCumulus(pair("copy", "before"));
    expect(
      container.querySelector<HTMLElement>("[data-card-change-pair]")?.dataset
        .cardChangeReveal,
    ).toBe("before");
    expect(
      container
        .querySelector('[data-card-change-face="after"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    unmount();

    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const reduced = renderInCumulus(pair("keyword", "before"));
    expect(
      reduced.container.querySelector<HTMLElement>("[data-card-change-pair]")
        ?.dataset.cardChangeReveal,
    ).toBe("complete");
  });
});

describe("PlayingCard", () => {
  it("keeps related Dreamsign reveal semantics and flips the prize into the drawn card", () => {
    const dreamsign = localizedDreamsignFixture({
      id: testDreamsignId("00000000-0000-4000-8000-000000000051"),
      name: "Bezoar",
      imageName: "bezoar.png",
      effectDescription: "Foresee 1.",
    });
    const prize = (revealDrawnCard: boolean) => (
      <PlayingCardPrize
        objectId="fixture-prize"
        title={"Fixture prize"}
        description={"Fixture reward"}
        accessibilityLabel={"Fixture prize and reward"}
        relatedDreamsign={dreamsign}
        size="compact"
        drawnCard={{ rank: "Q", suit: "hearts" }}
        revealDrawnCard={revealDrawnCard}
      />
    );
    const { container, rerender } = renderInCumulus(prize(false));
    const root = () =>
      container.querySelector<HTMLElement>("[data-playing-card-prize]");
    const dreamsignSource = root()?.querySelector<HTMLElement>(
      "[data-playing-card-prize-dreamsign-source]",
    );
    expect(dreamsignSource?.dataset.revealEntityType).toBe("dreamsign");
    expect(describedText(dreamsignSource)).not.toBe("");
    expect(root()?.dataset.playingCardPrizeState).toBe("prize");
    expect(root()?.dataset.playingCard).toBeUndefined();

    rerender(prize(true));
    expect(root()?.dataset.playingCardPrizeState).toBe("drawn");
    expect(root()?.dataset.playingCard).toBe("Q-hearts");
  });

  it("keeps four-suit and face-down cards concealed until they flip", () => {
    for (const variant of ["fourSuit", "faceDown"] as const) {
      const playing = (revealDrawnCard: boolean) => (
        <PlayingCard
          variant={variant}
          size="compact"
          drawnCard={{ rank: "7", suit: "clubs" }}
          revealDrawnCard={revealDrawnCard}
        />
      );
      const { container, rerender, unmount } = renderInCumulus(playing(false));
      const cardElement = container.querySelector<HTMLElement>(
        `[data-playing-card-variant="${variant}"]`,
      );
      expect(cardElement?.dataset.playingCardState).toBe("concealed");
      rerender(playing(true));
      expect(cardElement?.dataset.playingCardState).toBe("drawn");
      expect(cardElement?.dataset.playingCard).toBe("7-clubs");
      unmount();
    }
  });
});
