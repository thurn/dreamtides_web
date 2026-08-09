// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransfigurationButton } from "./TransfigurationButton";
import { CumulusRoot } from "../../CumulusRoot";
import { transfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";

function LocalizedTransfigurationButton(
  props: ComponentProps<typeof TransfigurationButton>,
) {
  return (
    <CumulusRoot>
      <TransfigurationButton {...props} />
    </CumulusRoot>
  );
}

const empowered = {
  type: "Empowered" as const,
  presentation: transfigurationFormFixture("Empowered"),
  change: { kind: "energy-delta" as const, from: 2, to: 1 },
  description: "Reduce this card's energy cost.",
  essenceCost: 40,
  affordable: true,
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TransfigurationButton", () => {
  it("owns the compact treatment and reports its semantic form type", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    act(() => {
      root.render(
        <LocalizedTransfigurationButton
          form={empowered}
          variant="compact"
          selected={false}
          onPress={onActivate}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.style.width).toBe("100%");
    expect(button?.style.justifyContent).toBe("center");
    expect(button?.style.textAlign).toBe("center");
    expect(button?.dataset.transfigurationButtonVariant).toBe("compact");
    expect(button?.textContent?.trim()).not.toBe("");
    expect(button?.getAttribute("aria-label")?.trim()).not.toBe("");

    act(() => button?.click());
    expect(onActivate).toHaveBeenCalledWith("Empowered");

    act(() => root.unmount());
  });

  it("owns the priced treatment and blocks unaffordable activation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    act(() => {
      root.render(
        <LocalizedTransfigurationButton
          form={{ ...empowered, essenceCost: 0, affordable: false }}
          variant="priced"
          selected
          onPress={onActivate}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.dataset.transfigurationButtonVariant).toBe("priced");
    expect(button?.style.gridTemplateColumns).toBe(
      "auto minmax(0, 1fr)",
    );
    expect(button?.style.padding).toBe("var(--space-xs)");
    expect(
      button?.querySelector("[data-transfiguration-button-price]"),
    ).toBeNull();
    expect(button?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => button?.click());
    expect(onActivate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
