// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HudDreamsignRow } from "./HudDreamsignRow";
import type { Dreamsign } from "../types/quest";
import { CumulusRoot } from "../cumulus/CumulusRoot";

/**
 * Tests for the HUD dreamsign row: one art tile per owned dreamsign,
 * hover popover with name + effect + larger art, bane styling, and an
 * overflow pill when the player owns more than ten dreamsigns.
 */

function makeDreamsign(overrides: Partial<Dreamsign> & { name: string }): Dreamsign {
  return {
    id: overrides.id ?? `test-dreamsign-${overrides.name}`,
    name: overrides.name,
    effectDescription: overrides.effectDescription ?? `${overrides.name} effect.`,
    isBane: overrides.isBane ?? false,
    imageName: overrides.imageName,
    imageAlt: overrides.imageAlt,
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

describe("HudDreamsignRow", () => {
  it("renders nothing when the dreamsign list is empty", () => {
    const { container, root } = mountInto(<HudDreamsignRow dreamsigns={[]} />);

    expect(container.querySelector('[data-testid="hud-dreamsign-row"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders one tile per owned dreamsign using its imageName", () => {
    const signs: Dreamsign[] = [
      makeDreamsign({ name: "Amanita", imageName: "amanita.png" }),
      makeDreamsign({ name: "Bag", imageName: "bag_2.png" }),
      makeDreamsign({ name: "Bell", imageName: "bell.png" }),
    ];

    const { container, root } = mountInto(<HudDreamsignRow dreamsigns={signs} />);

    const tiles = container.querySelectorAll('[data-testid="hud-dreamsign-icon"]');
    expect(tiles.length).toBe(3);
    const images = container.querySelectorAll("img");
    expect(images.length).toBe(3);
    expect(images[0].getAttribute("src")).toBe("/dreamsigns/amanita.png");
    expect(images[1].getAttribute("src")).toBe("/dreamsigns/bag_2.png");
    expect(images[2].getAttribute("src")).toBe("/dreamsigns/bell.png");

    act(() => {
      root.unmount();
    });
  });

  it("registers the name and effect as the tile's reveal description", () => {
      const sign = makeDreamsign({
        name: "Skull Codex",
        effectDescription: "When you draw a card, gain 1 gold.",
        imageName: "amanita.png",
      });

      const { container, root } = mountInto(
        <HudDreamsignRow dreamsigns={[sign]} />,
      );

      const tile = container.querySelector<HTMLElement>(
        '[data-testid="hud-dreamsign-icon"]',
      );
      expect(tile).not.toBeNull();
      const description = document.getElementById(tile?.getAttribute("aria-describedby") ?? "");
      expect(description?.textContent).toContain("Skull Codex");
      expect(description?.textContent).toContain(
        "When you draw a card, gain 1 gold.",
      );

      act(() => {
        root.unmount();
      });
  });

  it("distinguishes bane dreamsigns visually (red ring + grayscale)", () => {
    const signs: Dreamsign[] = [
      makeDreamsign({ name: "Boon Sign", imageName: "bell.png", isBane: false }),
      makeDreamsign({ name: "Curse Sign", imageName: "amanita.png", isBane: true }),
    ];

    const { container, root } = mountInto(<HudDreamsignRow dreamsigns={signs} />);

    const tiles = container.querySelectorAll('[data-testid="hud-dreamsign-icon"]');
    expect(tiles.length).toBe(2);

    const boonStyle = (tiles[0] as HTMLElement).getAttribute("style") ?? "";
    const baneStyle = (tiles[1] as HTMLElement).getAttribute("style") ?? "";

    expect(tiles[0].getAttribute("data-is-bane")).toBe("false");
    expect(tiles[1].getAttribute("data-is-bane")).toBe("true");
    // Bane art is desaturated while boon art keeps full color.
    expect(baneStyle).toContain("grayscale");
    expect(boonStyle).not.toContain("grayscale(0.7)");
    // Aria label reflects bane status for assistive tech.
    expect(tiles[1].getAttribute("aria-label")).toBe(
      "Bane dreamsign: Curse Sign",
    );
    expect(tiles[0].getAttribute("aria-label")).toBe("Dreamsign: Boon Sign");

    act(() => {
      root.unmount();
    });
  });

  it("keeps every dreamsign available as a named semantic source", () => {
    const signs: Dreamsign[] = Array.from({ length: 13 }, (_unused, i) =>
      makeDreamsign({
        name: `Sign ${String(i + 1)}`,
        imageName: "amanita.png",
      }),
    );

    const { container, root } = mountInto(<HudDreamsignRow dreamsigns={signs} />);

    const tiles = container.querySelectorAll('[data-testid="hud-dreamsign-icon"]');
    expect(tiles.length).toBe(13);

    const overflow = container.querySelector(
      '[data-testid="hud-dreamsign-overflow"]',
    );
    expect(overflow).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not show an overflow pill when the player owns exactly ten dreamsigns", () => {
    const signs: Dreamsign[] = Array.from({ length: 10 }, (_unused, i) =>
      makeDreamsign({
        name: `Sign ${String(i + 1)}`,
        imageName: "amanita.png",
      }),
    );

    const { container, root } = mountInto(<HudDreamsignRow dreamsigns={signs} />);

    const tiles = container.querySelectorAll('[data-testid="hud-dreamsign-icon"]');
    expect(tiles.length).toBe(10);

    expect(
      container.querySelector('[data-testid="hud-dreamsign-overflow"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
