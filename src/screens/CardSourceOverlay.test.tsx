// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardSourceOverlay } from "./CardSourceOverlay";
import type { CardSourceDebugEntry, CardSourceDebugState } from "../types/quest";
import type { Idf3ProvenanceSummary } from "../types/content";

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

function makeProvenance(): Idf3ProvenanceSummary {
  return {
    signatureCardNames: ["Soul Reaper", "Grim Harvest"],
    signatureWeightedNames: ["Soul Reaper", "Grim Harvest"],
    signatureDroppedNames: ["Forest"],
    anchors: [
      {
        similarityToSignature: 0.42,
        distinctiveCardNames: ["Soul Reaper", "Blood Artist"],
      },
    ],
    starterDistinctiveCardNames: ["Lantern Broker", "Grim Harvest"],
    starterCardCount: 24,
    sourceDecks: [
      {
        rank: 0,
        similarityToStarter: 1,
        distinctiveCardNames: ["Lantern Broker"],
        contributedCardCount: 24,
      },
      {
        rank: 1,
        similarityToStarter: 0.31,
        distinctiveCardNames: ["Driftbound Relic", "Tidal Surge"],
        contributedCardCount: 8,
      },
    ],
    cardProvenanceByNumber: {
      "11": {
        isSignature: false,
        inStarterDeck: true,
        copies: 1,
        sourceRank: 0,
        sourceSimilarity: 1,
      },
      "12": {
        isSignature: false,
        inStarterDeck: false,
        copies: 2,
        sourceRank: 1,
        sourceSimilarity: 0.31,
      },
    },
  };
}

describe("CardSourceOverlay", () => {
  it("walks the signature -> anchors -> starter -> growth chain and traces each card", () => {
    const { container, root } = mount(
      <CardSourceOverlay
        cardSourceDebug={makeOverlayState()}
        idf3Provenance={makeProvenance()}
        isOpen
        onClose={vi.fn()}
      />,
    );

    const text = container.textContent ?? "";
    // Algorithm walkthrough.
    expect(text).toContain("How this pool was built");
    expect(text).toContain("Signature");
    expect(text).toContain("Soul Reaper");
    expect(text).toContain("Anchor decks");
    expect(text).toContain("42% match to signature");
    expect(text).toContain("Starter deck");
    expect(text).toContain("Growth");
    // Per-card tracing: the starter card and the grown neighbour card.
    expect(text).toContain("Lantern Broker");
    expect(text).toContain("In your");
    expect(text).toContain("Driftbound Relic");
    expect(text).toContain("source deck");
    expect(text).toContain("31%");
    expect(text).toContain("that deck features");

    act(() => {
      root.unmount();
    });
  });

  it("falls back to a starter-deck / pool summary without provenance", () => {
    const { container, root } = mount(
      <CardSourceOverlay
        cardSourceDebug={makeOverlayState()}
        idf3Provenance={null}
        isOpen
        onClose={vi.fn()}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Why am I seeing these cards?");
    expect(text).toContain("Shop Offers");
    expect(text).not.toContain("How this pool was built");
    expect(text).toContain("Lantern Broker");
    expect(text).toContain("Starter deck");
    expect(text).toContain("In your");
    expect(text).toContain("Driftbound Relic");
    expect(text).toContain("Draft-pool card. 2 copies in the pool.");

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
      <CardSourceOverlay
        cardSourceDebug={overlay}
        idf3Provenance={null}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Why am I seeing these cards?");
    expect(container.textContent).toContain("Stripped Entry");
    expect(container.textContent).toContain("Pool");

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
        idf3Provenance={null}
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
