// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardSourceOverlay } from "./CardSourceOverlay";
import type { CardSourceDebugEntry, CardSourceDebugState } from "../types/quest";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    aside: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
  },
}));

function makeOverlayState(): CardSourceDebugState {
  return {
    screenLabel: "Shop Offers",
    surface: "Shop",
    entries: [
      {
        cardNumber: 11,
        cardName: "Lantern Broker",
        cardTides: ["warrior_pressure", "big_energy"],
        matchedMandatoryTides: ["warrior_pressure"],
        matchedOptionalTides: ["big_energy"],
        sourceTides: [
          {
            tideId: "warrior_pressure",
            displayName: "Iron Charge",
            requirement: "required",
            role: "structural",
          },
          {
            tideId: "big_energy",
            displayName: "Stormwell Surge",
            requirement: "optional",
            role: "supporting",
          },
        ],
        isFallback: false,
      },
      {
        cardNumber: 12,
        cardName: "Driftbound Relic",
        cardTides: ["outsider"],
        matchedMandatoryTides: [],
        matchedOptionalTides: [],
        sourceTides: [],
        isFallback: true,
      },
    ],
  };
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CardSourceOverlay", () => {
  it("renders per-card source tides with requirement and role labels", () => {
    const { container, root } = mount(
      <CardSourceOverlay
        cardSourceDebug={makeOverlayState()}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Why am I seeing these cards?");
    expect(container.textContent).toContain("Shop Offers");
    expect(container.textContent).toContain("Lantern Broker");
    expect(container.textContent).toContain("On theme");
    expect(container.textContent).toContain("Iron Charge");
    expect(container.textContent).toContain("Required");
    expect(container.textContent).toContain("Structural");
    expect(container.textContent).toContain("Stormwell Surge");
    expect(container.textContent).toContain("Optional");
    expect(container.textContent).toContain("Supporting");
    expect(container.textContent).toContain("Driftbound Relic");
    expect(container.textContent).toContain("Fallback");
    expect(container.textContent ?? "").not.toContain("warrior_pressure");
    expect(container.textContent ?? "").not.toContain("big_energy");
    expect(container.textContent ?? "").not.toContain("outsider");

    act(() => {
      root.unmount();
    });
  });

  it("shows literal tide documentation when a source tide is hovered", () => {
    vi.useFakeTimers();
    try {
      const { container, root } = mount(
        <CardSourceOverlay
          cardSourceDebug={makeOverlayState()}
          isOpen
          onClose={vi.fn()}
        />,
      );

      expect(
        document.body.querySelector("[data-tide-doc-popover='warrior_pressure']"),
      ).toBeNull();

      const tideTrigger = container.querySelector<HTMLElement>(
        "[data-tide-doc-trigger='warrior_pressure']",
      );
      expect(tideTrigger).not.toBeNull();
      const triggerWrapper = tideTrigger?.parentElement ?? null;
      expect(triggerWrapper).not.toBeNull();

      act(() => {
        triggerWrapper?.dispatchEvent(
          new MouseEvent("mouseover", { bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      const popover = document.body.querySelector(
        "[data-tide-doc-popover='warrior_pressure']",
      );
      expect(popover?.textContent).toContain("Display name: Iron Charge.");
      expect(popover?.textContent).toContain(
        "Mechanical identity: Low-curve Warriors, direct spark buffs, point racing, and aggressive battlefield snowball.",
      );
      expect(popover?.textContent).not.toContain(
        "A war drum beat made into doctrine.",
      );

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders without crashing when tide arrays are missing or empty", () => {
    // Realtime Database silently drops empty arrays on write, so a
    // round-tripped fallback entry arrives with `matchedMandatoryTides`,
    // `matchedOptionalTides`, and `cardTides` set to `undefined`. The
    // overlay must still render its summary chip without crashing.
    const strippedFallback = {
      cardNumber: 99,
      cardName: "Stripped Fallback",
      isFallback: true,
    } as unknown as CardSourceDebugEntry;
    const emptyArraysEntry: CardSourceDebugEntry = {
      cardNumber: 100,
      cardName: "Empty Arrays",
      cardTides: [],
      matchedMandatoryTides: [],
      matchedOptionalTides: [],
      sourceTides: [],
      isFallback: true,
    };
    const overlay: CardSourceDebugState = {
      screenLabel: "Draft Picks",
      surface: "Draft",
      entries: [strippedFallback, emptyArraysEntry],
    };

    const { container, root } = mount(
      <CardSourceOverlay
        cardSourceDebug={overlay}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Why am I seeing these cards?");
    expect(container.textContent).toContain("Stripped Fallback");
    expect(container.textContent).toContain("Empty Arrays");
    expect(container.textContent).toContain("Fallback");

    act(() => {
      root.unmount();
    });
  });

  it("renders without crashing when the entries field itself is missing", () => {
    // Defence-in-depth: a manually crafted or upstream-mangled overlay
    // state with `entries` set to `undefined` should still render its
    // header rather than crash the app.
    const overlay = {
      screenLabel: "Draft Picks",
      surface: "Draft",
    } as unknown as CardSourceDebugState;

    const { container, root } = mount(
      <CardSourceOverlay
        cardSourceDebug={overlay}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Why am I seeing these cards?");
    expect(container.textContent).toContain("Draft Picks");

    act(() => {
      root.unmount();
    });
  });
});
