// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamsignArtTile } from "./DreamsignArtTile";
import type { Dreamsign } from "../types/quest";

/**
 * Shared dreamsign artwork tile used on the Shop and Deck Viewer.
 *
 * The tile renders the dreamsign's `imageName` artwork (sourced from
 * `/dreamsigns/<imageName>`) inside a sized square, conveys bane vs. boon
 * via a tinted border + desaturation filter, and exposes a hover popover
 * with the dreamsign's full name and effect text.
 */

function makeDreamsign(
  overrides: Partial<Dreamsign> & { name: string },
): Dreamsign {
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

describe("DreamsignArtTile", () => {
  it("renders the dreamsign artwork from /dreamsigns/<imageName>", () => {
    const sign = makeDreamsign({
      name: "Black Horn",
      imageName: "black_horn.png",
    });

    const { container, root } = mountInto(
      <DreamsignArtTile dreamsign={sign} sizePx={64} />,
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
      <DreamsignArtTile dreamsign={sign} sizePx={48} />,
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
      <DreamsignArtTile dreamsign={sign} sizePx={48} />,
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
      <DreamsignArtTile dreamsign={sign} sizePx={48} />,
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
      <DreamsignArtTile dreamsign={sign} sizePx={48} />,
    );

    expect(container.querySelector("img")).toBeNull();
    // Some visible placeholder must still appear so the slot is not empty.
    expect(container.textContent).not.toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("shows a hover popover with the dreamsign name and effect text on mouseenter", () => {
    vi.useFakeTimers();
    try {
      const sign = makeDreamsign({
        name: "Black Horn",
        effectDescription:
          "When you dissolve or banish an enemy, gain 1 essence.",
        imageName: "black_horn.png",
      });

      const { container, root } = mountInto(
        <DreamsignArtTile dreamsign={sign} sizePx={64} />,
      );

      // Popover is not in the DOM before hover.
      expect(
        document.body.querySelectorAll(
          '[data-testid="dreamsign-art-popover"]',
        ).length,
      ).toBe(0);

      const tile = container.querySelector<HTMLElement>(
        '[data-testid="dreamsign-art-tile"]',
      );
      expect(tile).not.toBeNull();
      // HoverPopover wraps the child in a <span>; dispatch mouseover on the
      // wrapper because React attaches its listeners there.
      const triggerWrapper = tile?.parentElement ?? null;
      expect(triggerWrapper).not.toBeNull();

      act(() => {
        triggerWrapper?.dispatchEvent(
          new MouseEvent("mouseover", { bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      const popover = document.body.querySelector(
        '[data-testid="dreamsign-art-popover"]',
      );
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain("Black Horn");
      expect(popover?.textContent).toContain(
        "When you dissolve or banish an enemy",
      );

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
