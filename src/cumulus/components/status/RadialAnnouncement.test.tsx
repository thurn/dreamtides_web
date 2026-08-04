// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  ENERGY_ICON_COLOR,
  SPARK_ICON_COLOR,
} from "../controls/GlowIcon";
import { GLYPHS } from "../../primitives/glyph";
import { RadialAnnouncement } from "./RadialAnnouncement";

describe("RadialAnnouncement", () => {
  it("renders a semantic reward with canonical Essence notation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <RadialAnnouncement
          headline="Won!"
          detail="A locked Dreamsign"
          essenceGained={200}
          tone="reward"
          size="compact"
          duration="extended"
          announcementId="fixture-win"
        />,
      );
    });

    const announcement = container.querySelector<HTMLElement>(
      "[data-radial-announcement]",
    );
    expect(announcement?.dataset.radialAnnouncement).toBe("fixture-win");
    expect(announcement?.dataset.radialAnnouncementTone).toBe("reward");
    expect(announcement?.dataset.radialAnnouncementDuration).toBe("extended");
    expect(announcement?.textContent).toContain("Won!");
    expect(announcement?.textContent).toContain("+200");
    expect(
      announcement?.querySelector("[data-inline-glyph] i")?.className,
    ).toContain("bx-crypto");
    expect(
      announcement?.querySelector<HTMLElement>(
        "[data-radial-announcement-disc]",
      )?.style.width,
    ).toBe("184px");

    act(() => root.unmount());
    container.remove();
  });

  it("keeps the mini outcome ripple close to its compact disc", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<RadialAnnouncement headline="Bust!" size="mini" />);
    });

    expect(
      container.querySelector<HTMLElement>(
        "[data-radial-announcement-disc]",
      )?.style.width,
    ).toBe("108px");
    expect(
      container.querySelector<HTMLElement>(
        "[data-radial-announcement-ripple]",
      )?.style.inset,
    ).toBe("calc(-1 * var(--space-1))");

    act(() => root.unmount());
    container.remove();
  });
  it("renders a canonical glyph in place of the headline copy", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <RadialAnnouncement headline="Fast" headlineGlyph={GLYPHS.bolt} />,
      );
    });

    const headline = container.querySelector<HTMLElement>(
      "[data-radial-announcement-headline-glyph]",
    );
    expect(headline?.textContent).not.toContain("Fast");
    expect(
      headline
        ?.querySelector("[data-inline-glyph]")
        ?.getAttribute("aria-label"),
    ).toBe("Fast");
    expect(
      headline?.querySelector("[data-inline-glyph] i")?.className,
    ).toContain("bx-bolt");

    act(() => root.unmount());
    container.remove();
  });

  it("renders energy and spark marks as resource-colored inline glyphs", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <RadialAnnouncement
          headline="−1 ●"
          detail="All characters gain +1 ✦"
        />,
      );
    });

    const energy = container.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="energy"]',
    );
    const spark = container.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="spark"]',
    );
    expect(container.textContent).not.toMatch(/[●✦]/u);
    expect(energy?.querySelector("i")?.className).toContain("bx-fire-alt");
    expect(energy?.parentElement?.style.color).toContain(ENERGY_ICON_COLOR);
    expect(spark?.querySelector("i")?.className).toContain("bx-sparkle");
    expect(spark?.parentElement?.style.color).toContain(SPARK_ICON_COLOR);

    act(() => root.unmount());
    container.remove();
  });
});
