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
        cardTides: ["core", "support-a"],
        matchedMandatoryTides: ["core"],
        matchedOptionalTides: ["support-a"],
        isFallback: false,
      },
      {
        cardNumber: 12,
        cardName: "Driftbound Relic",
        cardTides: ["outsider"],
        matchedMandatoryTides: [],
        matchedOptionalTides: [],
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
  it("labels on-theme and fallback cards without exposing internal tide ids", () => {
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
    expect(container.textContent).toContain("Driftbound Relic");
    expect(container.textContent).toContain("Fallback");
    // The overlay must not surface internal tide taxonomy to the player.
    expect(container.textContent ?? "").not.toMatch(/tide/i);
    expect(container.textContent ?? "").not.toContain("core");
    expect(container.textContent ?? "").not.toContain("support-a");
    expect(container.textContent ?? "").not.toContain("outsider");

    act(() => {
      root.unmount();
    });
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
