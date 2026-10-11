// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { JourneyContent } from "../../data/journey-content";
import type { JourneyMutations } from "../../state/journey-context";
import { useJourney } from "../../state/journey-context";
import type { JourneyState } from "../../types/journey";
import { logEvent } from "../../logging";
import {
  parseJourneyId,
  parseDeckEntryId,
} from "../../types/identifiers";
import {
  testDreamsignId,
  testCardId,
  testJourneySeed,
  testAvatarId,
} from "../../types/test-identities";
import type { ReactElement, ReactNode } from "react";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { DesktopDeckViewerAdapter } from "./DesktopDeckViewerAdapter";

vi.mock("../../state/journey-context", () => ({
  useJourney: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

vi.mock("../../cumulus/screens/DesktopDeckViewer", () => ({
  DesktopDeckViewer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="desktop-deck-viewer">{children}</div>
  ),
}));

describe("DesktopDeckViewerAdapter", () => {
  function makeMutations(): JourneyMutations {
    return {} as JourneyMutations;
  }

  function makeCardDatabase(): Map<number, CardData> {
    return new Map([
      [
        1,
        {
          name: parseCardName("Archive Sentry"),
          id: testCardId("archive-sentry"),
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

  function makeState(): JourneyState {
    return {
      runId: parseJourneyId("journey:test"),
      seed: testJourneySeed("test-seed"),
      essence: 100,
      maxDreamsigns: 12,
      deck: [
        {
          entryId: parseDeckEntryId("entry-1"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
        },
      ],
      avatar: {
        id: testAvatarId("caller-1"),
        name: "Mira of Lanterns",
        title: "Keeper of Lantern Glass",
        renderedText: "Avatar rules.",
        imageNumber: "0005",
        startingEssence: 250,
      },
      resolvedPackage: null,
      cardSourceDebug: null,
      remainingDreamsignPool: [],
      dreamsigns: [
        {
          id: testDreamsignId("sign-1"),
          name: "Night's Mark",
          effectDescription: "Draw deeper.",
        },
      ],
      completionLevel: 0,
      atlas: {
        layers: [],
        nodes: {},
        startingNodeId: null,
        bossNodeId: null,
        bossIncarnationId: null,
        currentNodeId: null,
        knownDreamsignCarrierIds: [],
      },
      currentDreamscape: null,
      siteRuntime: {},
      draftState: null,
      screen: { type: "dreamscape" },
      failureSummary: null,
      hasSeenStartingDeckPopup: true,
      battleModifiers: [],
      shopModifiers: {
        freeRerolls: 0,
        essenceDiscountPercent: 0,
        freeNextShopModifiers: [],
        freePurchaseModifiers: [],
      },
      siteOfferModifiers: [],
      dreamscapeModifiers: [],
    };
  }

  function setJourneyContext(state: JourneyState): void {
    const cardDatabase = makeCardDatabase();
    vi.mocked(useJourney).mockReturnValue({
      state,
      mutations: makeMutations(),
      cardDatabase,
      journeyContent: {
        cardDatabase,
        avatars: [],
      } as unknown as JourneyContent,
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
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("DesktopDeckViewerAdapter", () => {
    it("logs the opened event once per open session even if journey state refreshes while mounted", () => {
      setJourneyContext(makeState());
      const onClose = vi.fn();
      const { root } = mount(
        <DesktopDeckViewerAdapter isOpen={false} onClose={onClose} />,
      );

      expect(logEvent).not.toHaveBeenCalled();

      act(() => {
        root.render(
          <DesktopDeckViewerAdapter isOpen={true} onClose={onClose} />,
        );
      });

      expect(logEvent).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenLastCalledWith("desktop_deck_viewer_opened", {
        cardCount: 1,
        dreamsignCount: 1,
        hasAvatar: true,
      });

      setJourneyContext(makeState());
      act(() => {
        root.render(
          <DesktopDeckViewerAdapter isOpen={true} onClose={onClose} />,
        );
      });

      expect(logEvent).toHaveBeenCalledTimes(1);

      act(() => {
        root.render(
          <DesktopDeckViewerAdapter isOpen={false} onClose={onClose} />,
        );
      });
      setJourneyContext(makeState());
      act(() => {
        root.render(
          <DesktopDeckViewerAdapter isOpen={true} onClose={onClose} />,
        );
      });

      expect(logEvent).toHaveBeenCalledTimes(2);
    });
  });
});
