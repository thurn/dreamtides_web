// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { JourneyContent } from "../../data/journey-content";
import type {
  JourneyContextValue,
  JourneyMutations,
} from "../../state/journey-context";
import { useJourney } from "../../state/journey-context";
import type { DreamscapeNode, JourneyState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeScreenProps } from "../../cumulus/screens/DreamscapeScreen";
import { logEvent, logEventOnce } from "../../logging";
import { DreamscapeScreenAdapter } from "./DreamscapeScreenAdapter";
import { makeTutorialConfiguration } from "../../testing/tutorial-configuration-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../../testing/atlas-fixtures";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import {
  parseAtlasNodeId,
  parseSiteId,
  parseJourneyId,
  parseDeckEntryId,
} from "../../types/identifiers";
import {
  testDreamscapeId,
  testDreamsignId,
  testCardId,
  testJourneySeed,
  testAvatarId,
} from "../../types/test-identities";
import type { ReactElement, ReactNode } from "react";
import { StartingDeckOverlayAdapter } from "./StartingDeckOverlayAdapter";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type { StartingDeckView } from "../../cumulus/screens/StartingDeckOverlay";
import { DesktopDeckViewerAdapter } from "./DesktopDeckViewerAdapter";

const screenMock = vi.hoisted(() =>
  vi.fn<(props: DreamscapeScreenProps) => void>(),
);

vi.mock("../../state/journey-context", () => ({
  useJourney: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

vi.mock("../../cumulus/screens/DreamscapeScreen", () => ({
  DreamscapeScreen: (props: DreamscapeScreenProps) => {
    screenMock(props);
    return null;
  },
}));

// Stub the overlay so the adapter's wiring (view + onClose) is observable
// without mounting the real glass chrome. Records the props of each render so a
// test can inspect the built view and invoke the wired `onClose`.
interface OverlayMockProps {
  isOpen: boolean;
  view: StartingDeckView;
  onClose: () => void;
}

const overlayMock = vi.fn<(props: OverlayMockProps) => null>((props) => {
  void props;
  return null;
});

vi.mock("../../cumulus/screens/StartingDeckOverlay", () => ({
  StartingDeckOverlay: (props: OverlayMockProps) => overlayMock(props),
}));

vi.mock("../../cumulus/screens/DesktopDeckViewer", () => ({
  DesktopDeckViewer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="desktop-deck-viewer">{children}</div>
  ),
}));

describe("DreamscapeScreenAdapter", () => {
  function lastScreenProps(): DreamscapeScreenProps {
    const calls = screenMock.mock.calls;
    const last = calls[calls.length - 1];
    if (last === undefined) throw new Error("screen was never rendered");
    return last[0];
  }

  function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
    const node: DreamscapeNode = {
      id: parseAtlasNodeId("node-1"),
      layer: LayerName.One,
      indexInLayer: 0,
      dreamscapeId: testDreamscapeId("ember_wood"),
      sites: [
        {
          id: parseSiteId("s-essence"),
          type: "Essence",
          isEnhanced: false,
          isVisited: false,
        },
        {
          id: parseSiteId("s-purge"),
          type: "Purge",
          isEnhanced: false,
          isVisited: false,
        },
        {
          id: parseSiteId("s-reward"),
          type: "Reward",
          isEnhanced: false,
          isVisited: false,
        },
      ],
      position: { x: 0, y: 0 },
      state: "available",
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
    };
    return {
      currentDreamscape: node.id,
      atlas: { nodes: { [node.id]: node } },
      completionLevel: 1,
      essence: 240,
      deck: [],
      avatar: null,
      dreamsigns: [],
      siteRuntime: {
        "s-essence": { kind: "essence", amount: 275, accepted: false },
        "s-reward": {
          kind: "reward",
          reward: {
            rewardType: "dreamsign",
            dreamsign: {
              id: testDreamsignId("dreamsign-uuid"),
              name: "Lantern in the Rain",
              effectDescription: "Your first dream each dawn costs 1 less.",
              imageName: "lantern-in-the-rain.webp",
            },
          },
          remainingDreamsignPoolIds: [],
          accepted: false,
        },
      },
      ...overrides,
    } as unknown as JourneyState;
  }

  function setJourneyContext(
    mutations: JourneyMutations,
    state: JourneyState = makeState(),
    journeyContent: Partial<JourneyContent> = {},
  ): void {
    vi.mocked(useJourney).mockReturnValue({
      state,
      mutations,
      journeyContent: {
        atlasData: MINIMAL_ATLAS_DATA,
        dreamscapes: MINIMAL_DREAMSCAPES,
        sitesData: MINIMAL_SITES_DATA,
        draftData: draftDataFixture(),
        ...journeyContent,
      },
    } as JourneyContextValue);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DreamscapeScreenAdapter", () => {
    it("logs tutorial dreamscape guidance when its delayed presentation appears", () => {
      const mutations = {} as JourneyMutations;
      setJourneyContext(
        mutations,
        makeState({
          runId: parseJourneyId("tutorial-run"),
          isTutorialJourney: true,
          completionLevel: 0,
          hasSeenStartingDeckPopup: true,
        }),
        {
          tutorial: {
            ...makeTutorialConfiguration(),
            dreamscape: {
              speechBubble: {
                speaker: "mira",
                delay: 2,
                horizontalOffset: 0,
                verticalOffset: 0,
                bubbleWidth: 700,
                text: "Visit [purple]Dream Sites[/purple].",
              },
            },
          },
        },
      );
      const container = document.createElement("div");
      const root = createRoot(container);
      act(() => root.render(<DreamscapeScreenAdapter />));

      expect(lastScreenProps().view.guideDialogue?.delaySeconds).toBe(2);
      act(() => lastScreenProps().onGuideDialogueShown?.());
      expect(logEventOnce).toHaveBeenCalledWith(
        "tutorial-dreamscape-guidance:tutorial-run:node-1",
        "tutorial_dreamscape_guidance_shown",
        expect.objectContaining({
          nodeId: parseAtlasNodeId("node-1"),
          delaySeconds: 2,
        }),
      );
      act(() => root.unmount());
    });

    it("accepts a prepared Essence reward without reopening the site", () => {
      const mutations = {
        ensureEssenceSiteRuntime: vi.fn(),
        acceptEssenceSite: vi.fn(),
        enterSite: vi.fn(),
      } as unknown as JourneyMutations;
      setJourneyContext(mutations);
      const container = document.createElement("div");
      const root = createRoot(container);
      act(() => root.render(<DreamscapeScreenAdapter />));

      act(() => lastScreenProps().onSelectSite(parseSiteId("s-essence")));
      expect(mutations.ensureEssenceSiteRuntime).not.toHaveBeenCalled();
      expect(mutations.enterSite).not.toHaveBeenCalled();

      act(() =>
        lastScreenProps().onInlineRewardAnimationComplete(
          parseSiteId("s-essence"),
        ),
      );
      expect(mutations.acceptEssenceSite).toHaveBeenCalledWith("s-essence");
      expect(logEvent).toHaveBeenCalledWith(
        "site_completed",
        expect.objectContaining({
          siteType: "Essence",
          outcome: "collected",
          rewardAmount: 275,
          essenceBefore: 240,
          essenceAfter: 515,
        }),
      );

      act(() => root.unmount());
    });

    it("opens inline sites whose runtime has not been prepared", () => {
      const mutations = {
        ensureEssenceSiteRuntime: vi.fn(),
        ensureRewardSiteRuntime: vi.fn(),
        enterSite: vi.fn(),
      } as unknown as JourneyMutations;
      setJourneyContext(mutations, makeState({ siteRuntime: {} }));
      const container = document.createElement("div");
      const root = createRoot(container);
      act(() => root.render(<DreamscapeScreenAdapter />));

      act(() => lastScreenProps().onSelectSite(parseSiteId("s-essence")));
      expect(mutations.ensureEssenceSiteRuntime).toHaveBeenCalledWith(
        "s-essence",
        false,
      );
      act(() => lastScreenProps().onSelectSite(parseSiteId("s-reward")));
      expect(mutations.ensureRewardSiteRuntime).toHaveBeenCalledWith(
        "s-reward",
      );
      expect(mutations.enterSite).not.toHaveBeenCalled();

      act(() => root.unmount());
    });

    it("replaces an owned Dreamsign by UUID for an at-cap Reward", () => {
      const mutations = {
        ensureRewardSiteRuntime: vi.fn(),
        acceptRewardSite: vi.fn(),
        enterSite: vi.fn(),
      } as unknown as JourneyMutations;
      setJourneyContext(
        mutations,
        makeState({
          maxDreamsigns: 2,
          dreamsigns: [
            {
              id: testDreamsignId("held-dreamsign-1"),
              name: "Held One",
              effectDescription: "First held dreamsign.",
            },
            {
              id: testDreamsignId("held-dreamsign-2"),
              name: "Held Two",
              effectDescription: "Second held dreamsign.",
            },
          ],
        }),
      );
      const container = document.createElement("div");
      const root = createRoot(container);
      act(() => root.render(<DreamscapeScreenAdapter />));

      act(() =>
        lastScreenProps().onInlineRewardAnimationComplete(
          parseSiteId("s-reward"),
        ),
      );

      expect(mutations.enterSite).not.toHaveBeenCalled();
      expect(lastScreenProps().view.replacement).toMatchObject({
        capacity: 2,
        incoming: { id: testDreamsignId("dreamsign-uuid") },
      });
      act(() =>
        lastScreenProps().onReplaceDreamsign(
          testDreamsignId("held-dreamsign-2"),
        ),
      );
      expect(mutations.acceptRewardSite).toHaveBeenCalledWith("s-reward", 1);
      expect(logEvent).toHaveBeenCalledWith(
        "site_completed",
        expect.objectContaining({
          siteId: parseSiteId("s-reward"),
          dreamsignId: testDreamsignId("dreamsign-uuid"),
          replacedDreamsignId: testDreamsignId("held-dreamsign-2"),
          outcome: "replaced_dreamsign",
        }),
      );

      act(() => root.unmount());
    });
  });
});

describe("StartingDeckOverlayAdapter", () => {
  function lastOverlayProps(): OverlayMockProps {
    const calls = overlayMock.mock.calls;
    const last = calls[calls.length - 1];
    if (last === undefined) throw new Error("overlay was never rendered");
    return last[0];
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
      deck: [
        {
          entryId: parseDeckEntryId("entry-1"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
        },
      ],
    } as unknown as JourneyState;
  }

  function setJourneyContext(): void {
    const cardDatabase = makeCardDatabase();
    vi.mocked(useJourney).mockReturnValue({
      state: makeState(),
      mutations: {} as JourneyMutations,
      cardDatabase,
      journeyContent: {
        cardDatabase,
      } as JourneyContent,
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
    setJourneyContext();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("StartingDeckOverlayAdapter", () => {
    it("builds the view from live state and logs the open once per open session", () => {
      const onClose = vi.fn();
      const { root } = mount(
        <StartingDeckOverlayAdapter isOpen={false} onClose={onClose} />,
      );
      expect(logEvent).not.toHaveBeenCalled();
      expect(lastOverlayProps().isOpen).toBe(false);

      act(() => {
        root.render(
          <StartingDeckOverlayAdapter isOpen={true} onClose={onClose} />,
        );
      });

      const props = lastOverlayProps();
      expect(props.isOpen).toBe(true);
      expect(props.view.cards).toHaveLength(1);
      expect(logEvent).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenLastCalledWith("starting_deck_modal_opened", {
        cardCount: 1,
      });

      // A state refresh while open does not re-log the open.
      setJourneyContext();
      act(() => {
        root.render(
          <StartingDeckOverlayAdapter isOpen={true} onClose={onClose} />,
        );
      });
      expect(logEvent).toHaveBeenCalledTimes(1);

      act(() => {
        root.unmount();
      });
    });
  });
});

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
      } as JourneyContent,
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
