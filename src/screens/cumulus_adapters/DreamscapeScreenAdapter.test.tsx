// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../../data/quest-content";
import type {
  QuestContextValue,
  QuestMutations,
} from "../../state/quest-context";
import { useQuest } from "../../state/quest-context";
import type { DreamscapeNode, QuestState } from "../../types/quest";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeScreenProps } from "../../cumulus/screens/DreamscapeScreen";
import { logEvent } from "../../logging";
import { DreamscapeScreenAdapter } from "./DreamscapeScreenAdapter";

const screenMock = vi.hoisted(() =>
  vi.fn<(props: DreamscapeScreenProps) => void>(),
);

vi.mock("../../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
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

function makeState(): QuestState {
  const node: DreamscapeNode = {
    id: "node-1",
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: "ember_wood",
    biomeName: "Ember Wood",
    biomeColor: "",
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
    essenceCap: 500,
    deck: [],
    dreamcaller: null,
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
            isBane: false,
          },
        },
        remainingDreamsignPoolIds: [],
        accepted: false,
      },
    },
  } as unknown as QuestState;
}

function setQuestContext(mutations: QuestMutations): void {
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(),
    mutations,
    questContent: {} as QuestContent,
  } as QuestContextValue);
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("DreamscapeScreenAdapter", () => {
  it("opens and accepts Essence from the dreamscape without navigating", () => {
    const mutations = {
      ensureEssenceSiteRuntime: vi.fn(),
      acceptEssenceSite: vi.fn(),
      setScreen: vi.fn(),
    } as unknown as QuestMutations;
    setQuestContext(mutations);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));

    act(() => lastScreenProps().onSelectSite("s-essence"));
    expect(mutations.ensureEssenceSiteRuntime).toHaveBeenCalledWith(
      "s-essence",
      false,
    );
    expect(mutations.setScreen).not.toHaveBeenCalled();

    act(() => lastScreenProps().onInlineRewardAnimationComplete("s-essence"));
    expect(mutations.acceptEssenceSite).toHaveBeenCalledWith("s-essence");
    expect(logEvent).toHaveBeenCalledWith(
      "site_completed",
      expect.objectContaining({
        siteType: "Essence",
        outcome: "collected",
        rewardAmount: 275,
        essenceBefore: 240,
        essenceAfter: 500,
        ui: "cumulus",
      }),
    );

    act(() => root.unmount());
  });

  it("opens and accepts a Reward from the dreamscape without navigating", () => {
    const mutations = {
      ensureRewardSiteRuntime: vi.fn(),
      acceptRewardSite: vi.fn(),
      setScreen: vi.fn(),
    } as unknown as QuestMutations;
    setQuestContext(mutations);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));

    act(() => lastScreenProps().onSelectSite("s-reward"));
    expect(mutations.ensureRewardSiteRuntime).toHaveBeenCalledWith("s-reward");
    expect(mutations.setScreen).not.toHaveBeenCalled();

    act(() =>
      lastScreenProps().onInlineRewardAnimationComplete("s-reward"),
    );
    expect(mutations.acceptRewardSite).toHaveBeenCalledWith("s-reward");
    expect(logEvent).toHaveBeenCalledWith(
      "site_completed",
      expect.objectContaining({
        siteType: "Reward",
        outcome: "collected",
        rewardType: "dreamsign",
        dreamsignId: "dreamsign-uuid",
        ui: "cumulus",
      }),
    );

    act(() => root.unmount());
  });

  it("continues to navigate when a non-Essence site is selected", () => {
    const mutations = {
      ensureEssenceSiteRuntime: vi.fn(),
      acceptEssenceSite: vi.fn(),
      ensureRewardSiteRuntime: vi.fn(),
      acceptRewardSite: vi.fn(),
      setScreen: vi.fn(),
    } as unknown as QuestMutations;
    setQuestContext(mutations);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<DreamscapeScreenAdapter />));

    act(() => lastScreenProps().onSelectSite("s-purge"));
    expect(mutations.setScreen).toHaveBeenCalledWith({
      type: "site",
      siteId: "s-purge",
    });
    expect(mutations.ensureEssenceSiteRuntime).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
