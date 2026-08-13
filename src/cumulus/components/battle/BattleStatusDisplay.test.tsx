import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { BattleStatusDisplay } from "./BattleStatusDisplay";

function LocalizedBattleStatusDisplay(
  props: ComponentProps<typeof BattleStatusDisplay>,
) {
  return (
    <CumulusRoot>
      <BattleStatusDisplay {...props} />
    </CumulusRoot>
  );
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("BattleStatusDisplay", () => {
  it("labels canonical ownership relative to the current perspective", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <LocalizedBattleStatusDisplay
          owner="enemy"
          relationship="near"
          dreamAvatar={null}
          currentEnergy={1}
          maxEnergy={2}
          points={3}
          pointsToWin={10}
        />,
      );
    });
    expect(
      container
        .querySelector("[data-battle-status]")
        ?.getAttribute("aria-label")
        ?.trim(),
    ).not.toBe("");
    act(() => root.unmount());
  });
  it("composes centered resources and a head portrait on standard Cumulus glass", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LocalizedBattleStatusDisplay
          owner="enemy"
          relationship="far"
          dreamAvatar={{
            imageNumber: "0042",
            name: assertLocalized("Astra"),
            title: assertLocalized("The Dawnbound"),
          }}
          currentEnergy={2}
          maxEnergy={3}
          points={4}
          pointsToWin={25}
          testId="enemy-status"
        />,
      );
    });

    const status = container.querySelector<HTMLElement>("[data-battle-status]");
    expect(status?.dataset.owner).toBe("enemy");
    expect(status?.dataset.currentEnergy).toBe("2");
    expect(status?.dataset.maxEnergy).toBe("3");
    expect(status?.dataset.points).toBe("4");
    expect(status?.dataset.pointsToWin).toBe("25");
    expect(status?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(status?.style.background).toContain("var(--glass-sheen)");
    expect(status?.style.background).toContain("var(--glass-fill)");
    expect(status?.style.backdropFilter).toContain("var(--glass-blur)");
    expect(status?.style.border).toContain("var(--glass-rim)");
    expect(status?.style.borderRadius).toBe("var(--radius-panel)");
    expect(status?.style.color).toBe("var(--text-on-glass)");
    expect(status?.style.height).toBe("100%");
    expect(status?.style.boxSizing).toBe("border-box");
    expect(status?.textContent).toContain("2/3");
    expect(status?.textContent).toContain("4/25");
    const energy = status?.querySelector<HTMLElement>(
      '[data-battle-status-resource="energy"]',
    );
    const points = status?.querySelector<HTMLElement>(
      '[data-battle-status-resource="points"]',
    );
    expect(energy?.style.justifyContent).toBe("center");
    expect(points?.style.justifyContent).toBe("center");
    expect(
      energy?.querySelector<HTMLElement>("[data-battle-resource-value]")?.style
        .font,
    ).toBe("var(--t-numeral)");
    expect(
      points?.querySelector<HTMLElement>("[data-battle-resource-value]")?.style
        .font,
    ).toBe("var(--t-numeral)");
    expect(
      energy?.querySelector<HTMLElement>("[data-inline-glyph]")?.style.color,
    ).toBe("var(--energy)");
    expect(
      points?.querySelector<HTMLElement>("[data-inline-glyph]")?.style.color,
    ).toBe("");
    expect(container.querySelector("img")?.alt).not.toBe("");
    expect(
      container.querySelector<HTMLElement>(
        "[data-battle-status-dream-avatar-slot]",
      )?.style.width,
    ).toBe("var(--touch-min)");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("reserves the portrait with a neutral rounded placeholder while it loads", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LocalizedBattleStatusDisplay
          owner="player"
          relationship="near"
          dreamAvatar={null}
          currentEnergy={0}
          maxEnergy={0}
          points={0}
          pointsToWin={10}
        />,
      );
    });

    const placeholder = container.querySelector<HTMLElement>(
      "[data-battle-status-dream-avatar-placeholder]",
    );
    expect(placeholder?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(placeholder?.style.width).toBe("100%");
    expect(placeholder?.style.height).toBe("var(--touch-min)");
    expect(placeholder?.style.borderRadius).toBe("var(--radius-compact)");
    expect(placeholder?.style.background).toBe("var(--surface-placeholder)");
    expect(container.querySelector("img")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("registers populated battle portraits with their ability reveal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LocalizedBattleStatusDisplay
          owner="player"
          relationship="near"
          dreamAvatar={{
            imageNumber: "0029",
            name: assertLocalized("Tensho"),
            title: assertLocalized("Daimyo of Lacquered Fury"),
          }}
          dreamAvatarProfile={{
            id: "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
            ability: assertLocalized("Avatar ability is not active"),
            unavailable: true,
          }}
          currentEnergy={0}
          maxEnergy={0}
          points={0}
          pointsToWin={10}
        />,
      );
    });

    const source = container.querySelector<HTMLElement>(
      "[data-dream-avatar-source]",
    );
    expect(source?.dataset.revealEntityId).toBe(
      "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
    );
    expect(source?.getAttribute("aria-disabled")).toBe("true");
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain("Avatar ability is not active");

    act(() => root.unmount());
    container.remove();
  });
});
