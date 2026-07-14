// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransfigurationFormButton } from "./TransfigurationFormButton";

const empowered = {
  type: "Empowered" as const,
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
  })) as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TransfigurationFormButton", () => {
  it("owns the compact treatment and reports its semantic form type", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    act(() => {
      root.render(
        <TransfigurationFormButton
          form={empowered}
          variant="compact"
          selected={false}
          onActivate={onActivate}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.style.width).toBe("100%");
    expect(button?.style.justifyContent).toBe("center");
    expect(button?.style.textAlign).toBe("center");
    expect(button?.dataset.transfigurationFormVariant).toBe("compact");
    expect(button?.textContent).toBe("Empowered");
    expect(button?.getAttribute("aria-label")).toBe(
      "Empowered, 40 essence",
    );

    act(() => button?.click());
    expect(onActivate).toHaveBeenCalledWith("Empowered");

    act(() => root.unmount());
  });

  it("owns the detailed treatment and blocks unaffordable activation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    act(() => {
      root.render(
        <TransfigurationFormButton
          form={{ ...empowered, essenceCost: 0, affordable: false }}
          variant="detailed"
          selected
          onActivate={onActivate}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.dataset.transfigurationFormVariant).toBe("detailed");
    expect(button?.style.gridTemplateColumns).toBe(
      "auto minmax(0, 1fr) auto",
    );
    expect(button?.style.padding).toBe("var(--space-4)");
    expect(button?.textContent).toBe(
      "EmpoweredReduce this card's energy cost.Free",
    );
    expect(button?.getAttribute("aria-label")).toBe("Empowered, free");
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => button?.click());
    expect(onActivate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
