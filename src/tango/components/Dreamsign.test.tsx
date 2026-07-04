// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dreamsign } from "./Dreamsign";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { GLOSSARY, type GlossaryEntry } from "../../data/glossary";
import { extractGlossaryTerms } from "../../data/glossary-terms";

/**
 * The unified dreamsign entity (formerly `DreamsignArtTile` +
 * `DreamsignHoverCard`).
 *
 * The tile renders the dreamsign's `imageName` artwork (from
 * `/dreamsigns/<imageName>`) inside a sized square with no chrome — the art
 * floats on the media — conveys a bane via a desaturation filter, and reveals
 * its full name + effect text through the shared InfoCard `object` variant.
 * jsdom exposes no `matchMedia`, so `usePressReveal` treats it as a coarse
 * pointer: a press-down reveals the card.
 */

function makeDreamsign(
  overrides: Partial<DreamsignData> & { name: string },
): DreamsignData {
  return {
    name: overrides.name,
    effectDescription:
      overrides.effectDescription ?? `${overrides.name} effect.`,
    isBane: overrides.isBane ?? false,
    imageName: overrides.imageName,
    imageAlt: overrides.imageAlt,
    id: overrides.id,
  };
}

function mountInto(node: React.ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Dreamsign", () => {
  it("renders the dreamsign artwork from /dreamsigns/<imageName>", () => {
    const sign = makeDreamsign({
      name: "Black Horn",
      imageName: "black_horn.png",
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={64} />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/dreamsigns/black_horn.png");
    expect(img?.getAttribute("alt")).toBe("Black Horn");

    act(() => {
      root.unmount();
    });
  });

  it("uses imageAlt when provided", () => {
    const sign = makeDreamsign({
      name: "Bell",
      imageName: "bell.png",
      imageAlt: "A ringing bell wreathed in mist",
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={48} />,
    );

    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      "A ringing bell wreathed in mist",
    );

    act(() => {
      root.unmount();
    });
  });

  it("desaturates bane dreamsigns and renders no tile chrome", () => {
    const sign = makeDreamsign({
      name: "Skull",
      imageName: "skull.png",
      isBane: true,
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={48} />,
    );

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile).not.toBeNull();
    expect(tile?.dataset.isBane).toBe("true");
    // Bane art is desaturated so the warning reads before the art does.
    expect(tile?.style.filter).toContain("grayscale");
    // The art floats on the media with no chrome: no border or background.
    expect(tile?.style.border).toBe("");
    expect(tile?.style.background).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("renders boon dreamsigns with no grayscale and no tile chrome", () => {
    const sign = makeDreamsign({
      name: "Moonstone",
      imageName: "moonstone.png",
      isBane: false,
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={48} />,
    );

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile?.dataset.isBane).toBe("false");
    expect(tile?.style.filter).not.toContain("grayscale");
    // No chrome: the boon art floats with no border or background.
    expect(tile?.style.border).toBe("");
    expect(tile?.style.background).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("falls back to a glyph only when imageName is missing", () => {
    const sign = makeDreamsign({ name: "Untextured" });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={48} />,
    );

    expect(container.querySelector("img")).toBeNull();
    // Some visible placeholder must still appear so the slot is not empty.
    expect(container.textContent).not.toBe("");

    act(() => {
      root.unmount();
    });
  });

  /**
   * A glossary fixture derived live from `GLOSSARY` so this test can never
   * hardcode a term/definition string that a content edit would invalidate. We
   * pick the first entry whose bare term is detected by `extractGlossaryTerms`
   * inside a plausible effect sentence, and whose definition contains a word
   * that does NOT already appear in that effect text (or in the term itself) —
   * so asserting on it proves the DEFINITION rendered, not merely the effect
   * text's colored keyword highlight.
   */
  function pickGlossaryFixture(): {
    entry: GlossaryEntry;
    effect: string;
    definitionWord: string;
  } {
    for (const entry of GLOSSARY) {
      const effect = `A dreamsign that lets you ${entry.term} things.`;
      if (!extractGlossaryTerms(effect).includes(entry)) {
        continue;
      }
      const effectWords = new Set(
        (effect.toLowerCase().match(/[a-z]+/g) ?? []),
      );
      const definitionWord = (entry.definition.match(/[A-Za-z]{4,}/g) ?? []).find(
        (word) => !effectWords.has(word.toLowerCase()),
      );
      if (definitionWord !== undefined) {
        return { entry, effect, definitionWord };
      }
    }
    throw new Error("No glossary entry yielded a usable definition fixture");
  }

  it("shows glossary term definitions in the reveal when the effect uses a keyword", () => {
    const { effect, definitionWord } = pickGlossaryFixture();
    const sign = makeDreamsign({
      name: "Keyworded",
      effectDescription: effect,
      imageName: "keyworded.png",
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={64} revealTestid="dreamsign-reveal" />,
    );

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    // Coarse pointer (jsdom has no matchMedia): press-down reveals.
    act(() => {
      tile?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    const reveal = document.body.querySelector(
      '[data-testid="dreamsign-reveal"]',
    );
    expect(reveal).not.toBeNull();
    // The definition stack is rendered as part of the reveal...
    expect(
      reveal?.querySelector('[data-testid="dreamsign-reveal-definition-stack"]'),
    ).not.toBeNull();
    // ...and it exposes the keyword's DEFINITION text, not just the highlight.
    expect(reveal?.textContent).toContain(definitionWord);

    act(() => {
      tile?.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    // Dismissing the reveal takes the definitions with it.
    expect(
      document.body.querySelectorAll('[data-testid="dreamsign-reveal"]').length,
    ).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it("reveals the dreamsign name and effect text through InfoCard on press", () => {
    const sign = makeDreamsign({
      name: "Black Horn",
      effectDescription:
        "When you dissolve or banish an enemy, gain 1 essence.",
      imageName: "black_horn.png",
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={64} revealTestid="dreamsign-reveal" />,
    );

    // The reveal is not in the DOM before the press.
    expect(
      document.body.querySelectorAll('[data-testid="dreamsign-reveal"]').length,
    ).toBe(0);

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile).not.toBeNull();

    // Coarse pointer (jsdom has no matchMedia): press-down reveals.
    act(() => {
      tile?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    const reveal = document.body.querySelector(
      '[data-testid="dreamsign-reveal"]',
    );
    expect(reveal).not.toBeNull();
    expect(reveal?.textContent).toContain("Black Horn");
    expect(reveal?.textContent).toContain(
      "When you dissolve or banish an enemy",
    );

    // Release dismisses the reveal on a coarse pointer.
    act(() => {
      tile?.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    expect(
      document.body.querySelectorAll('[data-testid="dreamsign-reveal"]').length,
    ).toBe(0);

    act(() => {
      root.unmount();
    });
  });
});
