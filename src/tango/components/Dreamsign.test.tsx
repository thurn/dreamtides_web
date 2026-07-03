// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dreamsign } from "./Dreamsign";
import type { Dreamsign as DreamsignData } from "../../types/quest";

/**
 * The unified dreamsign entity (formerly `DreamsignArtTile` +
 * `DreamsignHoverCard`).
 *
 * The tile renders the dreamsign's `imageName` artwork (from
 * `/dreamsigns/<imageName>`) inside a sized square, conveys bane vs. boon via a
 * tinted border + desaturation filter, and reveals its full name + effect text
 * through the shared InfoCard `object` variant. jsdom exposes no `matchMedia`, so
 * `usePressReveal` treats it as a coarse pointer: a press-down reveals the card.
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

  it("applies a bane border tint and desaturation filter for bane dreamsigns", () => {
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
    // Bane art is desaturated so the red ring reads as a warning.
    expect(tile?.style.filter).toContain("grayscale");
    // The bane ring uses a red-channel border colour.
    expect(tile?.style.border).toContain("239");

    act(() => {
      root.unmount();
    });
  });

  it("uses a purple boon border for non-bane dreamsigns and no grayscale", () => {
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
    // Boon ring uses a purple-channel border colour (168, 85, 247 family).
    expect(tile?.style.border).toContain("168");

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
