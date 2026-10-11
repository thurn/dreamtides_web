// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transfigurationPresentationFixture } from "../../test-helpers/transfiguration-fixture";
import { renderInCumulus } from "../../testing/render";
import { TransfigurationButton } from "./TransfigurationButton";
import { click } from "./controls.fixtures";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function pointer(
  type: "pointerdown" | "pointerup" | "pointerover",
  pointerType: "mouse" | "touch",
  pointerId: number,
  timeStamp = 0,
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 120,
    clientY: 80,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    timeStamp: { value: timeStamp },
  });
  return event;
}

describe("TransfigurationButton", () => {
  const empowered = {
    type: "Empowered" as const,
    presentation: transfigurationPresentationFixture("Empowered"),
    pricing: { kind: "unpriced" as const },
  };

  it("reveals its glossary form on pointer inspection and reports its form type", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 100, y: 100, width: 248, height: 110 }),
    );
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <TransfigurationButton
        form={empowered}
        layout="compact"
        selected={false}
        onPress={onPress}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.dataset.revealEntityType).toBe("glossary-term");
    expect(button.dataset.revealEntityId).toBe(
      empowered.presentation.glossaryUuid,
    );
    expect(button.getAttribute("aria-label")?.trim()).not.toBe("");
    act(() => {
      button.dispatchEvent(pointer("pointerover", "mouse", 1));
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    click(button);
    expect(onPress).toHaveBeenCalledWith("Empowered");
  });

  it("blocks unaffordable priced activation", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <TransfigurationButton
        form={{
          ...empowered,
          pricing: { kind: "essence", amount: 40, affordable: false },
        }}
        layout="wide"
        selected
        onPress={onPress}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(
      button.querySelector("[data-transfiguration-button-price]"),
    ).not.toBeNull();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
