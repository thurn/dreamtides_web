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
        inStarterDecklist: true,
        draftPoolCopies: 0,
      },
      {
        cardNumber: 12,
        cardName: "Driftbound Relic",
        inStarterDecklist: false,
        draftPoolCopies: 2,
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
  it("reports each card's starter-deck or draft-pool provenance", () => {
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
    expect(container.textContent).toContain("Starter deck");
    expect(container.textContent).toContain(
      "Part of this dreamcaller's starting decklist.",
    );
    expect(container.textContent).toContain("Driftbound Relic");
    expect(container.textContent).toContain("Draft pool");
    expect(container.textContent).toContain("Draft-pool card (2 copies).");

    act(() => {
      root.unmount();
    });
  });

  it("renders without crashing when provenance fields are missing", () => {
    // Realtime Database silently drops `false` and `0` on write, so a
    // round-tripped entry can arrive with `inStarterDecklist` and
    // `draftPoolCopies` set to `undefined`. The overlay must still render its
    // summary without crashing.
    const strippedEntry = {
      cardNumber: 99,
      cardName: "Stripped Entry",
    } as unknown as CardSourceDebugEntry;
    const overlay: CardSourceDebugState = {
      screenLabel: "Draft Picks",
      surface: "Draft",
      entries: [strippedEntry],
    };

    const { container, root } = mount(
      <CardSourceOverlay cardSourceDebug={overlay} isOpen onClose={vi.fn()} />,
    );

    expect(container.textContent).toContain("Why am I seeing these cards?");
    expect(container.textContent).toContain("Stripped Entry");
    expect(container.textContent).toContain("Draft pool");

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
      <CardSourceOverlay cardSourceDebug={overlay} isOpen onClose={vi.fn()} />,
    );

    expect(container.textContent).toContain("Why am I seeing these cards?");
    expect(container.textContent).toContain("Draft Picks");

    act(() => {
      root.unmount();
    });
  });
});
