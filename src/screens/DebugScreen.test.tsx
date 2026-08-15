// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import type {
  DreamsignTemplate,
  ResolvedAvatarPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import { DebugScreen } from "./DebugScreen";
import { parseSiteId } from "../types/identifiers";
import { testAvatarId, testDreamsignId, testCardId } from "../types/test-identities";

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
    name: parseCardName(name),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeResolvedPackage(): ResolvedAvatarPackage {
  return {
    avatar: {
      id: testAvatarId("caller-1"),
      name: "Caller of Lanterns",
      title: "Auditor of Debug Panels",
      renderedText: "Test rules text.",
      imageNumber: "0008",
      startingEssence: 250,
    },
    draftPoolCopiesByCard: { "1": 2, "2": 1 },
    dreamsignPoolIds: [
      testDreamsignId("sign-1"),
      testDreamsignId("sign-2"),
      testDreamsignId("sign-3"),
    ],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: 198,
    doubledCardCount: 41,
    legalSubsetCount: 4,
    preferredSubsetCount: 2,
  };
}

function makeDraftState(): DraftState {
  return {
    mode: "tides4",
    draftPoolCopiesByCard: { "1": 3, "2": 1 },
    remainingCopiesByCard: { "1": 3, "2": 1 },
    currentOffer: [1, 2],
    activeSiteId: parseSiteId("site-1"),
    pickNumber: 3,
    sitePicksCompleted: 2,
  };
}

const DREAMSIGN_TEMPLATES: readonly DreamsignTemplate[] = [
  {
    id: testDreamsignId("sign-1"),
    name: "First Sign",
    effectDescription: "First.",
  },
  {
    id: testDreamsignId("sign-2"),
    name: "Second Sign",
    effectDescription: "Second.",
  },
  {
    id: testDreamsignId("sign-3"),
    name: "Third Sign",
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
    root.render(<CumulusRoot>{element}</CumulusRoot>);
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
        remainingDreamsignPool={[testDreamsignId("sign-2")]}
        dreamsignTemplates={DREAMSIGN_TEMPLATES}
        journeyState={null}
      />,
    );

    expect(container.textContent).toContain("Debug: Package State");
    expect(container.textContent).toContain("Caller of Lanterns");
    expect(container.textContent).toContain("First Sign");
    expect(container.textContent).toContain("Second Sign");
    expect(container.textContent).toContain("Lantern Sprite");

    act(() => {
      root.unmount();
    });
  });
});
