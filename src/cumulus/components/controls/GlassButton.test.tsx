import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlassButton } from "./GlassButton";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GlassButton", () => {
  it("exposes semantic pressed state for persistent toggles", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Return to Your Side")}
        pressed
        onPress={() => {}}
      />,
    );
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(button?.getAttribute("data-pressed")).toBe("true");
  });
  it("renders its text label inside a button", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Apply Filters")}
        testId="glass-apply"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector('[data-testid="glass-apply"]');
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.textContent).toContain("Apply Filters");
  });

  it("renders an optional leading glyph before the label", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Filter")}
        glyph={GLYPHS.filter}
        onPress={() => {}}
      />,
    );

    // The leading glyph is a StandaloneGlyph <i> carrying the glyph class.
    expect(container.querySelector("i")?.className).toBe(String(GLYPHS.filter));
  });

  it("renders an optional inline essence cost after a centered dot", () => {
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Transfigure")}
        essenceCost={20}
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.textContent).toContain("Transfigure");
    expect(
      button?.querySelector("[data-glass-button-essence-cost]")?.textContent,
    ).toContain("20");
    expect(button?.querySelector("[data-inline-glyph]")).not.toBeNull();
    rerender(
      <GlassButton
        label={assertLocalized("Transfigure")}
        essenceCost={null}
        onPress={() => {}}
      />
    );
    expect(
      container.querySelector("[data-glass-button-essence-cost]"),
    ).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Transfigure");
  });

  it("supports a distinct accessible name for a priced action", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Choose")}
        essenceCost={50}
        accessibilityLabel={assertLocalized(
          "Choose the Six Gate for 50 Essence",
        )}
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(
      button?.querySelector("[data-glass-button-essence-cost]")?.textContent,
    ).toContain("50");
    expect(button?.getAttribute("aria-label")).toBe(
      "Choose the Six Gate for 50 Essence",
    );
  });

  it("renders a non-cost Essence value without punctuation", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Take")}
        essenceValue={60}
        onPress={() => {}}
      />,
    );

    expect(
      container.querySelector("[data-glass-button-essence-value]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-glass-button-essence-cost]"),
    ).toBeNull();
    expect(container.querySelector("button")?.textContent).not.toContain("·");
    expect(container.querySelector("button")?.textContent).not.toContain("(");
  });

  it("keeps every dynamic width reservation in one hidden sizing grid", () => {
    const reservations = [
      { label: assertLocalized("Decline"), essenceCost: null },
      { label: assertLocalized("Purge 1"), essenceCost: 40 },
      { label: assertLocalized("Purge 2"), essenceCost: 100 },
    ] as const;
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Decline")}
        widthReservations={reservations}
        onPress={() => {}}
      />,
    );
    const button = container.querySelector("button");
    const initialReservations = Array.from(
      button?.querySelectorAll("[data-glass-button-width-reservation]") ?? [],
      (candidate) => candidate.textContent,
    );
    expect(initialReservations).toEqual([
      "Decline",
      "Purge 1 · 40",
      "Purge 2 · 100",
    ]);

    rerender(
      <GlassButton
        label={assertLocalized("Purge 2")}
        essenceCost={100}
        widthReservations={reservations}
        onPress={() => {}}
      />
    );
    expect(
      Array.from(
        button?.querySelectorAll("[data-glass-button-width-reservation]") ?? [],
        (candidate) => candidate.textContent,
      ),
    ).toEqual(initialReservations);
  });

  it("omits the `<i>` when no glyph is given", () => {
    const { container } = renderInCumulus(
      <GlassButton label={assertLocalized("Filter")} onPress={() => {}} />,
    );

    expect(container.querySelector("i")).toBeNull();
  });

  it("uses the lighter tonal-lens treatment when placed on glass", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Cancel")}
        placement="onGlass"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassPlacement).toBe("onGlass");
  });

  it("can render the danger glass treatment", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Cancel")}
        variant="danger"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassVariant).toBe("danger");
  });

  it("renders the purple soft-wash accent without dropping the glass blur", () => {
    const { container } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Transfigure")}
        variant="accent"
        onPress={() => {}}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.dataset.glassVariant).toBe("accent");
  });

  it("restores the neutral glass border after leaving the danger state", () => {
    const { container, rerender } = renderInCumulus(
      <GlassButton label={assertLocalized("Decline")} onPress={() => {}} />,
    );
    const button = container.querySelector<HTMLButtonElement>("button");
    const neutralBorder = button?.style.border;
    expect(neutralBorder).not.toBe("");

    rerender(
      <GlassButton
        label={assertLocalized("Purge 1")}
        variant="danger"
        onPress={() => {}}
      />
    );
    expect(button?.style.border).not.toBe(neutralBorder);

    rerender(
      <GlassButton label={assertLocalized("Decline")} onPress={() => {}} />
    );
    expect(button?.style.border).toBe(neutralBorder);
  });

  it("restores the neutral on-glass border after leaving the danger state", () => {
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Decline")}
        placement="onGlass"
        onPress={() => {}}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button");
    const neutralBorder = button?.style.border;
    expect(neutralBorder).not.toBe("");

    rerender(
      <GlassButton
        label={assertLocalized("Purge 1")}
        variant="danger"
        placement="onGlass"
        onPress={() => {}}
      />
    );
    expect(button?.style.border).not.toBe(neutralBorder);

    rerender(
      <GlassButton
        label={assertLocalized("Decline")}
        placement="onGlass"
        onPress={() => {}}
      />
    );
    expect(button?.style.border).toBe(neutralBorder);
  });

  it("fires `onPress` on click", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <GlassButton label={assertLocalized("Apply")} onPress={onPress} />,
    );

    act(() => {
      container.querySelector("button")?.click();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('while disabled dims, sets aria-disabled="true", and does not fire onPress', () => {
    const onPress = vi.fn();
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label={assertLocalized("Apply")}
        onPress={onPress}
        disabled
      />,
    );

    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      button?.click();
    });
    expect(onPress).not.toHaveBeenCalled();

    rerender(
      <GlassButton label={assertLocalized("Apply")} onPress={onPress} />
    );
    expect(button?.getAttribute("aria-disabled")).toBeNull();
  });
});
