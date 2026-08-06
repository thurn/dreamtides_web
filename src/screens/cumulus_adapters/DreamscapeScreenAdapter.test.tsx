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
import { MINIMAL_ATLAS_DATA } from "../../__test-helpers__/atlas-fixtures";

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

function lastScreenProps(): DreamscapeScreenProps {
  const calls = screenMock.mock.calls;
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("screen was never rendered");
  return last[0];
}

function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
  const node: DreamscapeNode = {
    id: "node-1",
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: "ember_wood",
    biomeName: "Ember Wood",
    sites: [
      {
        id: "s-essence",
        type: "Essence",
        isEnhanced: false,
        isVisited: false,
      },
      {
        id: "s-purge",
        type: "Purge",
        isEnhanced: false,
        isVisited: false,
      },
      {
        id: "s-reward",
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
    dreamAvatar: null,
    dreamsigns: [],
    siteRuntime: {
      "s-essence": { kind: "essence", amount: 275, accepted: false },
      "s-reward": {
        kind: "reward",
        reward: {
          rewardType: "dreamsign",
          dreamsign: {
            id: "dreamsign-uuid",
            name: "Lantern in the Rain",
            effectDescription: "Your first dream each dawn costs 1 less.",
            imageName: "lantern-in-the-rain.webp",
            isNegative: false,
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
      ...journeyContent,
    },
  } as JourneyContextValue);
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("DreamscapeScreenAdapter", () => {
  it("logs tutorial dreamscape guidance when its delayed presentation appears", () => {
    const mutations = {} as JourneyMutations;
    setJourneyContext(
      mutations,
      makeState({
        runId: "tutorial-run",
        isTutorialJourney: true,
        completionLevel: 0,
        hasSeenStartingDeckPopup: true,
      }),
      {
        tutorialDreamscape: {
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
        nodeId: "node-1",
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

    act(() => lastScreenProps().onSelectSite("s-essence"));
    expect(mutations.ensureEssenceSiteRuntime).not.toHaveBeenCalled();
    expect(mutations.enterSite).not.toHaveBeenCalled();

    act(() => lastScreenProps().onInlineRewardAnimationComplete("s-essence"));
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

  it("accepts a prepared Reward without reopening the site", () => {
    const mutations = {
      ensureRewardSiteRuntime: vi.fn(),
      acceptRewardSite: vi.fn(),
      enterSite: vi.fn(),
    } as unknown as JourneyMutations;
    setJourneyContext(mutations);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));

    act(() => lastScreenProps().onSelectSite("s-reward"));
    expect(mutations.ensureRewardSiteRuntime).not.toHaveBeenCalled();
    expect(mutations.enterSite).not.toHaveBeenCalled();

    act(() => lastScreenProps().onInlineRewardAnimationComplete("s-reward"));
    expect(mutations.acceptRewardSite).toHaveBeenCalledWith("s-reward");
    expect(logEvent).toHaveBeenCalledWith(
      "site_completed",
      expect.objectContaining({
        siteType: "Reward",
        outcome: "collected",
        rewardType: "dreamsign",
        dreamsignId: "dreamsign-uuid",
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

    act(() => lastScreenProps().onSelectSite("s-essence"));
    expect(mutations.ensureEssenceSiteRuntime).toHaveBeenCalledWith(
      "s-essence",
      false,
    );
    act(() => lastScreenProps().onSelectSite("s-reward"));
    expect(mutations.ensureRewardSiteRuntime).toHaveBeenCalledWith("s-reward");
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
            id: "held-dreamsign-1",
            name: "Held One",
            effectDescription: "First held dreamsign.",
            isNegative: false,
          },
          {
            id: "held-dreamsign-2",
            name: "Held Two",
            effectDescription: "Second held dreamsign.",
            isNegative: false,
          },
        ],
      }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));

    act(() => lastScreenProps().onInlineRewardAnimationComplete("s-reward"));

    expect(mutations.enterSite).not.toHaveBeenCalled();
    expect(lastScreenProps().view.replacement).toMatchObject({
      maxDreamsigns: 2,
      pendingDreamsign: { id: "dreamsign-uuid" },
    });
    act(() => lastScreenProps().onReplaceDreamsign("held-dreamsign-2"));
    expect(mutations.acceptRewardSite).toHaveBeenCalledWith("s-reward", 1);
    expect(logEvent).toHaveBeenCalledWith(
      "site_completed",
      expect.objectContaining({
        siteId: "s-reward",
        dreamsignId: "dreamsign-uuid",
        replacedDreamsignId: "held-dreamsign-2",
        outcome: "replaced_dreamsign",
      }),
    );

    act(() => root.unmount());
  });

  it("declines an at-cap Reward without changing the Dreamsign collection", () => {
    const mutations = {
      acceptRewardSite: vi.fn(),
      completeSite: vi.fn(),
      enterSite: vi.fn(),
    } as unknown as JourneyMutations;
    setJourneyContext(
      mutations,
      makeState({
        maxDreamsigns: 1,
        dreamsigns: [
          {
            id: "held-dreamsign-1",
            name: "Held One",
            effectDescription: "First held dreamsign.",
            isNegative: false,
          },
        ],
      }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));
    act(() => lastScreenProps().onInlineRewardAnimationComplete("s-reward"));
    act(() => lastScreenProps().onDeclineReward());

    expect(mutations.completeSite).toHaveBeenCalledWith(
      "s-reward",
      "reward_site",
    );
    expect(mutations.acceptRewardSite).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      "reward_declined",
      expect.objectContaining({
        siteId: "s-reward",
        dreamsignId: "dreamsign-uuid",
        outcome: "kept_current_collection",
      }),
    );

    act(() => root.unmount());
  });

  it("safely ignores a stale replacement UUID", () => {
    const mutations = {
      acceptRewardSite: vi.fn(),
    } as unknown as JourneyMutations;
    setJourneyContext(
      mutations,
      makeState({
        maxDreamsigns: 1,
        dreamsigns: [{
          id: "held-dreamsign-1",
          name: "Held One",
          effectDescription: "First held dreamsign.",
          isNegative: false,
        }],
      }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));
    act(() => lastScreenProps().onInlineRewardAnimationComplete("s-reward"));
    act(() => lastScreenProps().onReplaceDreamsign("missing-dreamsign"));

    expect(mutations.acceptRewardSite).not.toHaveBeenCalled();
    expect(lastScreenProps().view.replacement).not.toBeNull();
    act(() => root.unmount());
  });

  it("continues to navigate when a non-Essence site is selected", () => {
    const mutations = {
      ensureEssenceSiteRuntime: vi.fn(),
      acceptEssenceSite: vi.fn(),
      ensureRewardSiteRuntime: vi.fn(),
      acceptRewardSite: vi.fn(),
      enterSite: vi.fn(),
    } as unknown as JourneyMutations;
    setJourneyContext(mutations);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));

    act(() => lastScreenProps().onSelectSite("s-purge"));
    expect(mutations.enterSite).toHaveBeenCalledWith("s-purge");
    expect(mutations.ensureEssenceSiteRuntime).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
