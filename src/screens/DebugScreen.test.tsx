// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import type {
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import { DebugScreen } from "./DebugScreen";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
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
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    button: ({
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
    } & HTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
}));

function makeCard(cardNumber: number, name: string): CardData {
  return {
    name,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    tides: ["package"],
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeResolvedPackage(): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "caller-1",
      name: "Caller of Lanterns",
      title: "Auditor of Debug Panels",
      renderedText: "Test rules text.",
      imageNumber: "0008",
      startingEssence: 250,
      mandatoryTides: ["core"],
      optionalTides: ["support-a", "support-b", "support-c", "support-d"],
    },
    mandatoryTides: ["core"],
    optionalSubset: ["support-a", "support-b", "support-c"],
    selectedTides: ["core", "support-a", "support-b", "support-c"],
    draftPoolCopiesByCard: { "1": 2, "2": 1 },
    dreamsignPoolIds: ["sign-1", "sign-2", "sign-3"],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: 198,
    doubledCardCount: 41,
    legalSubsetCount: 4,
    preferredSubsetCount: 2,
  };
}

function makeDraftState(): DraftState {
  return {
    remainingCopiesByCard: { "1": 3, "2": 1 },
    currentOffer: [1, 2],
    activeSiteId: "site-1",
    pickNumber: 3,
    sitePicksCompleted: 2,
  };
}

const DREAMSIGN_TEMPLATES: readonly DreamsignTemplate[] = [
  {
    id: "sign-1",
    name: "First Sign",
    packageTides: ["core"],
    effectDescription: "First.",
  },
  {
    id: "sign-2",
    name: "Second Sign",
    packageTides: ["support-a"],
    effectDescription: "Second.",
  },
  {
    id: "sign-3",
    name: "Third Sign",
    packageTides: ["support-b"],
    effectDescription: "Third.",
  },
] as const;

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

describe("DebugScreen", () => {
  it("shows package-only details on the debug overlay", () => {
    const { container, root } = mount(
      <DebugScreen
        isOpen
        onClose={vi.fn()}
        draftState={makeDraftState()}
        cardDatabase={
          new Map<number, CardData>([
            [1, makeCard(1, "Lantern Sprite")],
            [2, makeCard(2, "Archive Sentry")],
          ])
        }
        resolvedPackage={makeResolvedPackage()}
        remainingDreamsignPool={["sign-2"]}
        dreamsignTemplates={DREAMSIGN_TEMPLATES}
      />,
    );

    expect(container.textContent).toContain("Debug: Package State");
    expect(container.textContent).toContain("Caller of Lanterns");
    expect(container.textContent).toContain("Required Packages");
    expect(container.textContent).toContain("core");
    expect(container.textContent).toContain("Selected Optional Packages");
    expect(container.textContent).toContain("support-a");
    expect(container.textContent).toContain("support-b");
    expect(container.textContent).toContain("support-c");
    expect(container.textContent).toContain("Full Draft Pool Packages");
    expect(container.textContent).toContain("core");
    expect(container.textContent).toContain("First Sign");
    expect(container.textContent).toContain("Second Sign");
    expect(container.textContent).toContain("Lantern Sprite");

    act(() => {
      root.unmount();
    });
  });
});
