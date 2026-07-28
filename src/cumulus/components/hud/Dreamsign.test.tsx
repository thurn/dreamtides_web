// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dreamsign } from "./Dreamsign";
import type { Dreamsign as DreamsignData } from "../../../types/journey";
import {
  GLOSSARY,
  GLOSSARY_IDS,
  requireGlossaryEntry,
  type GlossaryEntry,
} from "../../../data/glossary";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { CumulusRoot } from "../../CumulusRoot";

/**
 * The unified dreamsign entity (formerly `DreamsignArtTile` +
 * `DreamsignHoverCard`).
 *
 * The tile renders the dreamsign's `imageName` artwork (from
 * `/dreamsigns/<imageName>`) inside a sized square with no chrome — the art
 * floats on the media — conveys a bane via a desaturation filter, and reveals
 * its full name + effect text through the shared InfoCard `object` variant.
 * jsdom exposes no `matchMedia`, so the reveal coordinator treats it as a coarse
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
    id: overrides.id ?? "00000000-0000-4000-8000-000000000031",
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
    root.render(<CumulusRoot>{node}</CumulusRoot>);
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
  it("owns its UUID reveal model and ordered glossary definitions", () => {
    const { entry, effect } = pickGlossaryFixture();
    const sign = makeDreamsign({ name: "Semantic sign", effectDescription: effect, imageName: "semantic.png" });
    const { container } = mountInto(<Dreamsign dreamsign={sign} sizePx={64} />);
    const tile = container.querySelector<HTMLElement>('[data-testid="dreamsign-art-tile"]');
    expect(tile?.dataset.dreamsignId).toBe(sign.id);
    expect(tile?.dataset.revealFeedback).toBe("measured");
    expect(tile?.dataset.revealEntityType).toBe("dreamsign");
    expect(tile?.dataset.revealEntityId).toBe(sign.id);
    expect(tile?.dataset.revealPrimaryVariant).toBe("object");
    expect(tile?.dataset.revealSecondaryTitles).toBe("");
    expect(tile?.tabIndex).toBe(0);
    expect(tile?.style.touchAction).toBe("pan-x pan-y");
    const description = document.getElementById(tile?.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain(sign.name);
    expect(description?.textContent).toContain(effect);
    expect(description?.textContent).toContain(entry.definition);
  });

  it.each([
    {
      id: "553D2317-32F9-47BC-BAE0-5018CA26D56A",
      effect:
        "The first ❖ card you play during the opponent's turn costs 1● less.",
      glossaryId: GLOSSARY_IDS.fast,
    },
    {
      id: "D2A916C1-321A-4AE3-9A50-0B7F13C5EFF6",
      effect: "You may play ❖❖ events for 1●.",
      glossaryId: GLOSSARY_IDS.interrupt,
    },
  ])(
    "keeps $glossaryId card timing prose on the card definition",
    ({ id, effect, glossaryId }) => {
      const sign = makeDreamsign({
        id,
        name: "Card timing sign",
        effectDescription: effect,
      });
      const { container, root } = mountInto(
        <Dreamsign dreamsign={sign} sizePx={64} />,
      );
      const tile = container.querySelector<HTMLElement>(
        '[data-testid="dreamsign-art-tile"]',
      );
      const description = document.getElementById(
        tile?.getAttribute("aria-describedby") ?? "",
      );

      expect(description?.textContent).toContain(
        requireGlossaryEntry(glossaryId).definition,
      );
      expect(description?.textContent).not.toContain("ability may be activated");

      act(() => {
        root.unmount();
      });
    },
  );

  it("requires a stable dreamsign id for render data attributes", () => {
    const sign = makeDreamsign({ name: "Nameless Id", id: undefined });
    delete sign.id;

    expect(() => {
      mountInto(<Dreamsign dreamsign={sign} sizePx={64} />);
    }).toThrow(/Dreamsign tile dreamsign is missing a stable id/);
  });

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

  it("composes the hud variant's drop-shadow into the tile filter", () => {
    const sign = makeDreamsign({
      name: "Moonstone",
      imageName: "moonstone.png",
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={36} variant="hud" />,
    );

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    // The hud variant wears the object's own drop-shadow + violet glow so it
    // lifts off busy scene art; the flat default does not.
    expect(tile?.style.filter).toContain("drop-shadow");

    act(() => {
      root.unmount();
    });
  });

  it("wears no drop-shadow in the default flat variant", () => {
    const sign = makeDreamsign({
      name: "Moonstone",
      imageName: "moonstone.png",
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={36} />,
    );

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile?.style.filter).not.toContain("drop-shadow");

    act(() => {
      root.unmount();
    });
  });

  it("combines the bane desaturation with the hud drop-shadow", () => {
    const sign = makeDreamsign({
      name: "Amanita",
      imageName: "amanita.png",
      isBane: true,
    });

    const { container, root } = mountInto(
      <Dreamsign dreamsign={sign} sizePx={36} variant="hud" />,
    );

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    // A bane docked in the HUD carries BOTH signals in one composed filter.
    expect(tile?.style.filter).toContain("grayscale");
    expect(tile?.style.filter).toContain("drop-shadow");

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

  it("includes glossary definitions in its accessible reveal description", () => {
    const { effect, definitionWord } = pickGlossaryFixture();
    const sign = makeDreamsign({
      name: "Keyworded",
      effectDescription: effect,
      imageName: "keyworded.png",
    });

    const { container, root } = mountInto(<Dreamsign dreamsign={sign} sizePx={64} />);

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    const description = document.getElementById(tile?.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain(definitionWord);

    act(() => {
      root.unmount();
    });
  });

  it("retains name and effect text for focus users", () => {
    const sign = makeDreamsign({
      name: "Black Horn",
      effectDescription:
        "When you dissolve or banish an enemy, gain 1 essence.",
      imageName: "black_horn.png",
    });

    const { container, root } = mountInto(<Dreamsign dreamsign={sign} sizePx={64} />);

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile).not.toBeNull();

    act(() => tile?.focus());
    expect(tile?.dataset.revealActive).toBe("true");
    const description = document.getElementById(tile?.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Black Horn");
    expect(description?.textContent).toContain(
      "When you dissolve or banish an enemy",
    );

    act(() => {
      root.unmount();
    });
  });
});
