// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopDeckViewerAdapter } from "./DesktopDeckViewerAdapter";
import { logEvent } from "../../logging";
import { useQuest } from "../../state/quest-context";
import type { QuestContent } from "../../data/quest-content";
import type { QuestMutations } from "../../state/quest-context";
import type { CardData } from "../../types/cards";
import type { QuestState } from "../../types/quest";
import { asCardId, asCardName } from "../../types/card-identity";

vi.mock("../../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../../cumulus/screens/DesktopDeckViewer", () => ({
  DesktopDeckViewer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="desktop-deck-viewer">{children}</div>
  ),
}));

function makeMutations(): QuestMutations {
  return {} as QuestMutations;
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        name: asCardName("Archive Sentry"),
        id: asCardId("archive-sentry"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        renderedText: "Hold the line.",
        imageNumber: 1,
        artOwned: true,
      },
    ],
  ]);
}

function makeState(): QuestState {
  return {
    runId: "quest:test",
    seed: "test-seed",
    essence: 100,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
    ],
    dreamcaller: {
      id: "caller-1",
      name: "Mira of Lanterns",
      title: "Keeper of Lantern Glass",
      renderedText: "Dreamcaller rules.",
      imageNumber: "0005",
      startingEssence: 250,
    },
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [
      {
        id: "sign-1",
        name: "Night's Mark",
        effectDescription: "Draw deeper.",
        isBane: false,
      },
    ],
    completionLevel: 0,
    atlas: {
      layers: [],
      nodes: {},
      startingNodeId: "",
      bossNodeId: "",
      bossIncarnationId: null,
      currentNodeId: null,
      knownDreamsignCarrierIds: [],
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "dreamscape" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function setQuestContext(state: QuestState): void {
  const cardDatabase = makeCardDatabase();
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase,
    questContent: {
      cardDatabase,
    } as QuestContent,
  });
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

describe("DesktopDeckViewerAdapter", () => {
  it("logs the opened event once per open session even if quest state refreshes while mounted", () => {
    setQuestContext(makeState());
    const onClose = vi.fn();
    const { root } = mount(
      <DesktopDeckViewerAdapter isOpen={false} onClose={onClose} />,
    );

    expect(logEvent).not.toHaveBeenCalled();

    act(() => {
      root.render(<DesktopDeckViewerAdapter isOpen={true} onClose={onClose} />);
    });

    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenLastCalledWith("desktop_deck_viewer_opened", {
      cardCount: 1,
      dreamsignCount: 1,
      hasDreamcaller: true,
    });

    setQuestContext(makeState());
    act(() => {
      root.render(<DesktopDeckViewerAdapter isOpen={true} onClose={onClose} />);
    });

    expect(logEvent).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <DesktopDeckViewerAdapter isOpen={false} onClose={onClose} />,
      );
    });
    setQuestContext(makeState());
    act(() => {
      root.render(<DesktopDeckViewerAdapter isOpen={true} onClose={onClose} />);
    });

    expect(logEvent).toHaveBeenCalledTimes(2);
  });
});
