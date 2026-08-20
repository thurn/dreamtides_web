// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransfigurationButton } from "./TransfigurationButton";
import { CumulusRoot } from "../../CumulusRoot";
import { localizedTransfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";

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
  presentation: localizedTransfigurationFormFixture("Empowered"),
  pricing: { kind: "unpriced" as const },
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TransfigurationButton", () => {
  it("reveals the authored form description on pointer inspection", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 348,
      bottom: 210,
      width: 248,
      height: 110,
      toJSON: () => ({}),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LocalizedTransfigurationButton
          form={empowered}
          layout="wide"
          selected={false}
          onPress={() => undefined}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button")!;
    const descriptionId = button.getAttribute("aria-describedby")!;
    expect(button.dataset.revealEntityType).toBe("glossary-term");
    expect(button.dataset.revealEntityId).toBe(
      empowered.presentation.glossaryUuid,
    );
    expect(document.querySelectorAll(`#${descriptionId} > span`)).toHaveLength(
      2,
    );

    const pointerOver = new MouseEvent("pointerover", { bubbles: true });
    Object.defineProperties(pointerOver, {
      pointerType: { value: "mouse" },
      pointerId: { value: 1 },
    });
    act(() => {
      button.dispatchEvent(pointerOver);
    });

    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );

    act(() => root.unmount());
  });

  it("owns the compact treatment and reports its semantic form type", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    act(() => {
      root.render(
        <LocalizedTransfigurationButton
          form={empowered}
          layout="compact"
          selected={false}
          onPress={onActivate}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.style.width).toBe("100%");
    expect(button?.style.justifyContent).toBe("center");
    expect(button?.style.textAlign).toBe("center");
    expect(button?.dataset.transfigurationButtonLayout).toBe("compact");
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
          form={{
            ...empowered,
            pricing: { kind: "essence", amount: 40, affordable: false },
          }}
          layout="wide"
          selected
          onPress={onActivate}
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.dataset.transfigurationButtonLayout).toBe("wide");
    expect(button?.style.gridTemplateColumns).toBe(
      "auto minmax(0, 1fr) auto",
    );
    expect(button?.style.padding).toBe("var(--space-xs)");
    expect(
      button?.querySelector("[data-transfiguration-button-price]"),
    ).not.toBeNull();
    expect(button?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => button?.click());
    expect(onActivate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
