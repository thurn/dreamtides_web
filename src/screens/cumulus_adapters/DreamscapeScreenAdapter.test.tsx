import { SELECTION_RULES_VERSION } from "../../reward-selection";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
} from "../../types/identifiers";
import {
  testDreamscapeId,
  testDreamsignId,
} from "../../types/test-identities";

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
        tutorial: makeTutorialConfiguration(),
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
  it("dispatches nonfirst enhanced UUID choice, live cap replacement and decline through existing intents", () => {
    const first = { id: testDreamsignId("adapter-first"), name: "Same name", effectDescription: "" };
    const second = { ...first, id: testDreamsignId("adapter-second") };
    const held = { ...first, id: testDreamsignId("adapter-held") };
    const state = makeState({ maxDreamsigns: 1, dreamsigns: [] });
    state.siteRuntime[parseSiteId("s-reward")] = { kind: "reward", reward: { rewardType: "dreamsign", dreamsign: first },
      accepted: false, remainingDreamsignPoolIds: [], enhancedDreamsignOffer: { standardDreamsignId: first.id,
        offeredDreamsigns: [first, second], requestedCount: 3, selectionRulesVersion: SELECTION_RULES_VERSION } };
    const mutations = { acceptRewardSite: vi.fn(), acceptDreamsignOffer: vi.fn(), rejectDreamsignOffer: vi.fn() } as unknown as JourneyMutations;
    setJourneyContext(mutations, state);
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<DreamscapeScreenAdapter />));
    act(() => lastScreenProps().onInlineRewardAnimationComplete(parseSiteId("s-reward")));
    expect(mutations.acceptRewardSite).not.toHaveBeenCalled();
    act(() => lastScreenProps().onRewardChoice?.(second.id));
    expect(mutations.acceptDreamsignOffer).toHaveBeenCalledWith("s-reward", second, undefined);
    vi.mocked(mutations.acceptDreamsignOffer).mockClear();
    state.dreamsigns = [held]; setJourneyContext(mutations, state);
    act(() => root.render(<DreamscapeScreenAdapter />));
    act(() => lastScreenProps().onRewardChoice?.(second.id));
    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(lastScreenProps().view.rewardChoice?.replacement?.incoming.id).toBe(second.id);
    act(() => lastScreenProps().onCancelRewardReplacement?.());
    expect(lastScreenProps().view.rewardChoice?.replacement).toBeNull();
    act(() => lastScreenProps().onRewardChoice?.(second.id));
    act(() => lastScreenProps().onRewardChoice?.(second.id, held.id));
    expect(mutations.acceptDreamsignOffer).toHaveBeenCalledWith("s-reward", second, 0);
    act(() => lastScreenProps().onDeclineRewardChoice?.());
    expect(mutations.rejectDreamsignOffer).toHaveBeenCalledWith("s-reward");
    act(() => root.unmount());
  });

});
