// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CardStatOrb } from "./CardStatOrb";
import type { CardStatChangeBadge } from "./CardStatOrb";
import { CumulusRoot } from "../../CumulusRoot";

function mountOrb(
  value: string,
  changeBadgeKind?: "empowered" | "kindled",
  ariaLabel?: string,
) {
  const changeBadge: CardStatChangeBadge | undefined =
    changeBadgeKind === undefined
      ? undefined
      : { kind: changeBadgeKind, accessibleName: "Synthetic form" };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <CardStatOrb
          variant={changeBadgeKind === "kindled" ? "spark" : "energy"}
          value={value}
          sizeVar="60px"
          numberSizeVar="45px"
          numberCapPx={45}
          changeBadge={changeBadge}
          authoredAriaLabel={ariaLabel}
        />
      </CumulusRoot>,
    );
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

describe("CardStatOrb transfiguration badge", () => {
  it.each([
    ["empowered", "fa-hammer"],
    ["kindled", "fa-hammer"],
  ] as const)(
    "renders the %s shape while preserving the white numeral",
    (changeBadge, glyphClass) => {
      const { container, root } = mountOrb("12", changeBadge);
      const orb = container.querySelector<HTMLElement>("[data-card-stat]");
      const badge = container.querySelector<HTMLElement>(
        `[data-card-stat-change="${changeBadge}"]`,
      );
      const badgeFace = badge?.querySelector<HTMLElement>(":scope > span");

      const labelledBy = orb?.getAttribute("aria-labelledby")?.split(" ") ?? [];
      expect(labelledBy).toHaveLength(2);
      expect(labelledBy.every((id) => document.getElementById(id) !== null)).toBe(true);
      expect(orb?.querySelector<HTMLElement>(":scope > div")?.style.color).toBe(
        "rgb(255, 255, 255)",
      );
      expect(badgeFace?.style.width).toBe("calc(30px)");
      expect(badge?.style.right).toBe("calc(-9px)");
      expect(badgeFace?.style.background).toBe("rgb(0, 0, 0)");
      expect(badgeFace?.style.border).toContain("rgb(255, 255, 255)");
      expect(badgeFace?.querySelector(`.${glyphClass}`)).not.toBeNull();

      act(() => root.unmount());
      container.remove();
    },
  );

  it.each(["7", "12", "X"])(
    "keeps the %s value in the fitted numeral layer",
    (value) => {
      const { container, root } = mountOrb(value, "empowered");
      const number = container.querySelector<HTMLElement>(
        '[data-card-stat="energy"] > div',
      );

      expect(number?.textContent).toBe(value);
      expect(number?.style.overflow).toBe("hidden");
      expect(number?.style.whiteSpace).toBe("nowrap");

      act(() => root.unmount());
      container.remove();
    },
  );

  it("keeps a custom accessible name while announcing its change badge", () => {
    const unchanged = mountOrb("2", undefined, "Custom stat context");
    const unchangedLabel = unchanged.container
      .querySelector<HTMLElement>("[data-card-stat]")
      ?.getAttribute("aria-labelledby")?.split(" ") ?? [];
    act(() => unchanged.root.unmount());
    unchanged.container.remove();

    const changed = mountOrb("2", "empowered", "Custom stat context");
    const changedLabel = changed.container
      .querySelector<HTMLElement>("[data-card-stat]")
      ?.getAttribute("aria-labelledby")?.split(" ") ?? [];

    expect(unchangedLabel).toHaveLength(1);
    expect(changedLabel).toHaveLength(2);
    expect(changedLabel.every((id) => document.getElementById(id) !== null)).toBe(true);

    act(() => changed.root.unmount());
    changed.container.remove();
  });
});
