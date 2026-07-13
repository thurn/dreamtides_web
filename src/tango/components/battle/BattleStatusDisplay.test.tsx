// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { BattleStatusDisplay } from "./BattleStatusDisplay";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("BattleStatusDisplay", () => {
  it("composes centered resources and a head portrait on standard Tango glass", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BattleStatusDisplay
          owner="enemy"
          dreamcaller={{
            imageNumber: "0042",
            name: "Astra",
            title: "The Dawnbound",
          }}
          currentEnergy={2}
          maxEnergy={3}
          points={4}
          testId="enemy-status"
        />,
      );
    });

    const status = container.querySelector<HTMLElement>("[data-battle-status]");
    expect(status?.dataset.owner).toBe("enemy");
    expect(status?.dataset.currentEnergy).toBe("2");
    expect(status?.dataset.maxEnergy).toBe("3");
    expect(status?.dataset.points).toBe("4");
    expect(status?.getAttribute("aria-label")).toBe(
      "Enemy: 2 of 3 energy, 4 points",
    );
    expect(status?.style.background).toContain("var(--glass-sheen)");
    expect(status?.style.background).toContain("var(--glass-fill)");
    expect(status?.style.backdropFilter).toContain("var(--glass-blur)");
    expect(status?.style.border).toContain("var(--glass-rim)");
    expect(status?.style.borderRadius).toBe("var(--radius-panel)");
    expect(status?.style.color).toBe("var(--text-on-glass)");
    expect(status?.textContent).toContain("2/3");
    expect(status?.textContent).toContain("4");
    const energy = status?.querySelector<HTMLElement>(
      '[data-battle-status-resource="energy"]',
    );
    const points = status?.querySelector<HTMLElement>(
      '[data-battle-status-resource="points"]',
    );
    expect(energy?.style.justifyContent).toBe("center");
    expect(points?.style.justifyContent).toBe("center");
    expect(
      energy?.querySelector<HTMLElement>("[data-resource-chip]")?.style
        .fontSize,
    ).toBe("16px");
    expect(
      points?.querySelector<HTMLElement>("[data-resource-chip]")?.style
        .fontSize,
    ).toBe("16px");
    expect(energy?.querySelector("i")?.getAttribute("style")).toContain(
      "--energy",
    );
    expect(points?.querySelector("i")?.getAttribute("style")).toContain(
      "inherit",
    );
    expect(container.querySelector("img")?.alt).toBe("Astra, The Dawnbound");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
