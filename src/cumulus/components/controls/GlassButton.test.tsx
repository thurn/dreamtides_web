// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { GlassButton } from "./GlassButton";
import { click } from "./controls.fixtures";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GlassButton", () => {
  it("fires onPress, exposes pressed state, and blocks disabled presses", () => {
    const onPress = vi.fn();
    const { container, rerender } = renderInCumulus(
      <GlassButton label="Apply" pressed onPress={onPress} />,
    );
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    click(button);
    expect(onPress).toHaveBeenCalledOnce();

    rerender(<GlassButton label="Apply" disabled onPress={onPress} />);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    click(button);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("renders an optional essence cost under a distinct accessible name", () => {
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label="Choose"
        essenceCost={50}
        accessibilityLabel="Choose for 50"
        onPress={() => {}}
      />,
    );
    const button = container.querySelector("button")!;
    expect(
      button.querySelector("[data-glass-button-essence-cost]")?.textContent,
    ).toContain("50");
    expect(button.getAttribute("aria-label")).toBe("Choose for 50");

    rerender(
      <GlassButton label="Choose" essenceCost={null} onPress={() => {}} />,
    );
    expect(
      container.querySelector("[data-glass-button-essence-cost]"),
    ).toBeNull();
  });

  it("keeps its width reservations stable while the label changes", () => {
    const reservations = [
      { label: "Decline", essenceCost: null },
      { label: "Purge 1", essenceCost: 40 },
      { label: "Purge 2", essenceCost: 100 },
    ] as const;
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label="Decline"
        widthReservations={reservations}
        onPress={() => {}}
      />,
    );
    const read = () =>
      Array.from(
        container.querySelectorAll("[data-glass-button-width-reservation]"),
        (candidate) => candidate.textContent,
      );
    const initial = read();
    expect(initial).toHaveLength(reservations.length);
    rerender(
      <GlassButton
        label="Purge 2"
        essenceCost={100}
        widthReservations={reservations}
        onPress={() => {}}
      />,
    );
    expect(read()).toEqual(initial);
  });
});
