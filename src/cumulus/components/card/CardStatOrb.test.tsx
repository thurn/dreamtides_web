// @vitest-environment jsdom

// CardStatOrb: the value and change badge labels.
import { describe, expect, it } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { CardStatOrb } from "./CardStatOrb";

describe("CardStatOrb", () => {
  function orb(changed: boolean, ariaLabel?: string) {
    return (
      <CardStatOrb
        variant="energy"
        value="12"
        sizeVar="60px"
        numberSizeVar="45px"
        numberCapPx={45}
        changeBadge={
          changed
            ? { kind: "empowered", accessibleName: "Synthetic form" }
            : undefined
        }
        ariaLabel={ariaLabel}
      />
    );
  }

  function labelRefs(container: HTMLElement): string[] {
    return (
      container
        .querySelector("[data-card-stat]")
        ?.getAttribute("aria-labelledby")
        ?.split(" ") ?? []
    );
  }

  it("announces the value and its change badge through existing labels", () => {
    const { container, rerender } = renderInCumulus(
      orb(false, "Custom stat context"),
    );
    expect(labelRefs(container)).toHaveLength(1);

    rerender(orb(true, "Custom stat context"));
    const ids = labelRefs(container);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => document.getElementById(id) !== null)).toBe(true);
    expect(
      container.querySelector('[data-card-stat-change="empowered"]'),
    ).not.toBeNull();
  });
});
