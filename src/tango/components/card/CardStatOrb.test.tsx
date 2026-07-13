// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CardStatOrb } from "./CardStatOrb";

function mountOrb(
  value: string,
  changeBadge?: "empowered" | "kindled",
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CardStatOrb
        variant={changeBadge === "kindled" ? "spark" : "energy"}
        value={value}
        sizeVar="60px"
        numberSizeVar="45px"
        numberCapPx={45}
        changeBadge={changeBadge}
      />,
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
    ["empowered", "bx-bolt"],
    ["kindled", "bx-flame"],
  ] as const)("renders the %s shape while preserving the white numeral", (changeBadge, glyphClass) => {
    const { container, root } = mountOrb("12", changeBadge);
    const orb = container.querySelector<HTMLElement>("[data-card-stat]");
    const badge = container.querySelector<HTMLElement>(
      `[data-card-stat-change="${changeBadge}"]`,
    );

    expect(orb?.getAttribute("aria-label")).toContain(
      changeBadge === "empowered" ? "Empowered" : "Kindled",
    );
    expect(orb?.querySelector<HTMLElement>(":scope > div")?.style.color).toBe(
      "rgb(255, 255, 255)",
    );
    expect(badge?.style.width).toBe("calc(30px)");
    expect(badge?.style.background).toBe("rgb(0, 0, 0)");
    expect(badge?.style.border).toContain("rgb(255, 255, 255)");
    expect(badge?.querySelector(`.${glyphClass}`)).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

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
});
