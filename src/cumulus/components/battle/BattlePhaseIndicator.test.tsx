// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { mountCumulus } from "../../test-helpers/component-test-fixtures";
import { BattlePhaseIndicator } from "./BattlePhaseIndicator";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattlePhaseIndicator", () => {
  it("exposes every controlled phase in both orientations", () => {
    for (const side of ["near", "far"] as const)
      for (const phase of [
        "dawn",
        "day",
        "dusk",
        "night",
        "challenge",
      ] as const) {
        const { container, root } = mountCumulus(
          <BattlePhaseIndicator phase={phase} side={side} />,
        );
        const indicator = container.querySelector<HTMLElement>(
          "[data-battle-phase]",
        );
        expect(indicator?.dataset.battlePhase).toBe(phase);
        expect(indicator?.dataset.battleSide).toBe(side);
        expect(indicator?.getAttribute("aria-label")).not.toBe("");
        expect(indicator?.style.top).toBe(side === "near" ? "0px" : "100%");
        expect(
          container.querySelector<HTMLElement>("[data-battle-phase-light]")
            ?.style.left,
        ).not.toBe("");
        act(() => root.unmount());
      }
  });

  it("publishes a reduced-motion override for every animated treatment", () => {
    const { container, root } = mountCumulus(
      <BattlePhaseIndicator phase="challenge" side="near" />,
    );
    const style = container.querySelector("style")?.textContent ?? "";
    expect(style).toContain("prefers-reduced-motion: reduce");
    expect(style).toContain("animation: none !important");
    expect(style).toContain("transition: none !important");
    act(() => root.unmount());
  });

  it("tracks rapid controlled phase and side changes without retaining local state", () => {
    function Harness() {
      const [phase, setPhase] = useState<
        "dawn" | "day" | "dusk" | "night" | "challenge"
      >("dawn");
      const [side, setSide] = useState<"near" | "far">("near");
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setPhase("night");
              setPhase("challenge");
              setSide("far");
            }}
          >
            Advance
          </button>
          <BattlePhaseIndicator phase={phase} side={side} />
        </>
      );
    }
    const { container, root } = mountCumulus(<Harness />);
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    const indicator = container.querySelector<HTMLElement>(
      "[data-battle-phase]",
    );
    expect(indicator?.dataset.battlePhase).toBe("challenge");
    expect(indicator?.dataset.battleSide).toBe("far");
    act(() => root.unmount());
  });
});
