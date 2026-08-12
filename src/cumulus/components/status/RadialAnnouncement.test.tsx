// @vitest-environment jsdom

import { act } from "react";
import { assertLocalized } from "@trox/runtime";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  ENERGY_ICON_COLOR,
  SPARK_ICON_COLOR,
} from "../controls/StandaloneGlyph";
import { GLYPHS } from "../../primitives/glyph";
import { CumulusRoot } from "../../CumulusRoot";
import { RadialAnnouncement } from "./RadialAnnouncement";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("RadialAnnouncement", () => {
  it("renders a semantic reward with canonical Essence notation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            headline={assertLocalized("Won!")}
            detail={assertLocalized("A locked Dreamsign")}
            essenceGained={200}
            tone="reward"
            size="compact"
            duration="extended"
            announcementId="fixture-win"
          />
        </CumulusRoot>,
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
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            headline={assertLocalized("Bust!")}
            size="mini"
          />
        </CumulusRoot>,
      );
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
    ).toBe("calc(-1 * var(--space-xxs))");

    act(() => root.unmount());
    container.remove();
  });

  it("uses the shared transient disc for card-attached scoring", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            variant="card-score"
            points={3}
            announcementId="challenge-resolved:player:5:F0"
          />
        </CumulusRoot>,
      );
    });

    const announcement = container.querySelector<HTMLElement>(
      '[data-radial-announcement-variant="card-score"]',
    );
    expect(announcement?.dataset.radialAnnouncement).toBe(
      "challenge-resolved:player:5:F0",
    );
    expect(announcement?.dataset.radialAnnouncementPoints).toBe("3");
    expect(announcement?.getAttribute("aria-label")).toContain("3");
    expect(
      announcement?.querySelector<HTMLElement>(
        "[data-radial-announcement-disc]",
      )?.style.width,
    ).toBe("78%");
    expect(announcement?.querySelector("i.bxf.bx-star-circle")).not.toBeNull();
    expect(announcement?.textContent).not.toContain("⍟");
    const disc = announcement?.querySelector<HTMLElement>(
      "[data-radial-announcement-disc]",
    );
    expect(disc?.hasAttribute("data-battle-card-points-bubble")).toBe(true);
    expect(
      disc?.querySelector("[data-battle-card-points-value]")?.textContent,
    ).toBe("3");
    expect(
      announcement?.querySelector("[data-radial-announcement-ripple]"),
    ).toBeNull();
    const orbit = announcement?.querySelector<HTMLElement>(
      "[data-radial-announcement-orbit]",
    );
    expect(orbit?.hasAttribute("data-battle-card-points-orbit")).toBe(true);
    expect(orbit?.getAttribute("style")).toContain("var(--accent-bright)");

    act(() => root.unmount());
    container.remove();
  });

  it("owns available and blocked merge-target circle treatments", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            variant="merge-target"
            status="available"
            addedSpark={2}
          />
        </CumulusRoot>,
      );
    });

    const available = container.querySelector<HTMLElement>(
      '[data-radial-announcement-variant="merge-target"]',
    );
    expect(available?.dataset.radialAnnouncementTargetStatus).toBe("available");
    expect(available?.textContent).toContain("2");
    expect(available?.querySelector("i.bx-sparkle")).not.toBeNull();
    expect(
      available?.querySelector<HTMLElement>(
        "[data-radial-announcement-disc]",
      )?.style.animation,
    ).toContain("radial-announcement-target-disc");
    const availableOrbit = available?.querySelector<HTMLElement>(
      "[data-radial-announcement-orbit]",
    );
    expect(availableOrbit?.getAttribute("style")).toContain(
      "var(--border-accent)",
    );
    expect(availableOrbit?.getAttribute("style")).toContain(
      "var(--accent-bright)",
    );

    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement variant="merge-target" status="blocked" />
        </CumulusRoot>,
      );
    });
    const blocked = container.querySelector<HTMLElement>(
      '[data-radial-announcement-variant="merge-target"]',
    );
    expect(blocked?.dataset.radialAnnouncementTargetStatus).toBe("blocked");
    expect(blocked?.dataset.radialAnnouncementTone).toBe("danger");
    expect(blocked?.textContent?.trim()).not.toBe("");

    act(() => root.unmount());
    container.remove();
  });

  it("owns the persistent victory circle and title sequence", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            variant="victory"
            headline={assertLocalized("Victory")}
            announcementId="fixture-victory"
          />
        </CumulusRoot>,
      );
    });

    const victory = container.querySelector<HTMLElement>(
      '[data-radial-announcement-variant="victory"]',
    );
    const title = victory?.querySelector<HTMLElement>(
      "[data-radial-announcement-headline]",
    );
    expect(victory?.dataset.radialAnnouncement).toBe("fixture-victory");
    expect(title?.tagName).toBe("H1");
    expect(title?.textContent).toBe("Victory");
    expect(title?.style.animation).toContain(
      "radial-announcement-victory-title-move",
    );
    expect(
      victory?.querySelectorAll("[data-radial-announcement-orbit]"),
    ).toHaveLength(2);
    expect(
      victory?.querySelectorAll("[data-radial-announcement-ripple]"),
    ).toHaveLength(2);
    expect(
      victory?.querySelector("[data-radial-announcement-symbol=\"victory\"]"),
    ).not.toBeNull();
    expect(victory?.querySelector("style")?.textContent).toContain(
      '[data-radial-announcement-variant="victory"]',
    );

    act(() => root.unmount());
    container.remove();
  });

  it("renders a persistent orbiting hand total", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            variant="hand-total"
            owner="dealer"
            total={17}
            size="mini"
          />
        </CumulusRoot>,
      );
    });

    const total = container.querySelector<HTMLElement>(
      '[data-radial-announcement-variant="hand-total"]',
    );
    expect(total?.dataset.radialAnnouncementOwner).toBe("dealer");
    expect(total?.dataset.radialAnnouncementTotal).toBe("17");
    expect(total?.getAttribute("aria-label")).toContain("17");
    expect(total?.querySelector<HTMLElement>(
      "[data-radial-announcement-hand-total-orbit]",
    )?.style.animation).toContain("infinite");

    act(() => root.unmount());
    container.remove();
  });

  it("renders a canonical glyph in place of the headline copy", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <RadialAnnouncement
            headline={assertLocalized("Fast")}
            headlineGlyph={GLYPHS.bolt}
          />
        </CumulusRoot>,
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
        <CumulusRoot>
          <RadialAnnouncement
            headline={assertLocalized("−1 ●")}
            detail={assertLocalized("All characters gain +1 ✦")}
          />
        </CumulusRoot>,
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
