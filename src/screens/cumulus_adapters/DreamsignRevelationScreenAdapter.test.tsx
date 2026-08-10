// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamsignRevelationScreenAdapter } from "./DreamsignRevelationScreenAdapter";
import { useJourney } from "../../state/journey-context";
import type { JourneyContent } from "../../data/journey-content";
import type {
  JourneyContextValue,
  JourneyMutations,
} from "../../state/journey-context";
import type { DreamGuideContent } from "../../types/content";
import type {
  DreamscapeNode,
  Dreamsign,
  JourneyState,
} from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import { LayerName } from "../../types/layer-name";
import { economyFixture } from "../../testing/economy-fixture";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";

const screenMock = vi.hoisted(() => vi.fn());
const loggingMock = vi.hoisted(() => {
  const emitted: Array<{
    key: string;
    event: string;
    fields: Record<string, unknown>;
  }> = [];
  const keys = new Set<string>();
  return {
    emitted,
    keys,
    logEventOnce: vi.fn(
      (key: string, event: string, fields: Record<string, unknown>) => {
        if (keys.has(key)) {
          return null;
        }
        keys.add(key);
        emitted.push({ key, event, fields });
        return { event };
      },
    ),
  };
});

vi.mock("../../state/journey-context", () => ({
  useJourney: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEventOnce: loggingMock.logEventOnce,
}));

vi.mock("../../cumulus/screens/DreamsignRevelationScreen", () => ({
  DreamsignRevelationScreen: (props: unknown) => {
    screenMock(props);
    return null;
  },
}));

const GUIDE: DreamGuideContent = {
  id: "sigrun-guide",
  name: "Sigrun",
  homeDreamscapeId: "winterwake",
  siteType: "DreamsignRevelation",
  portraitSource: "fixture-guide.png",
  dialogue: { site: ["Choose what the frost reveals."] },
  homeSpecialty: "Dreamsign Revelation",
};

const TUTORIAL_CONFIGURATION: TutorialSiteConfiguration = {
  speechBubble: {
    speaker: "mira",
    delay: 1,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 600,
    text: "A [purple]Dreamsign[/purple] gives ongoing benefits.",
  },
};

function makeDreamsign(id: string): Dreamsign {
  return {
    id,
    name: `Dreamsign ${id}`,
    effectDescription: "Drawn from the test pool.",
    imageName: `${id}.png`,
    imageAlt: `Dreamsign ${id}`,
  };
}

function makeState(): JourneyState {
  const site = {
    id: "site-1",
    type: "DreamsignRevelation",
    isEnhanced: false,
    isVisited: false,
  } as const;
  const node: DreamscapeNode = {
    id: "node-1",
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: "winterwake",
    biomeName: "Winterwake",
    sites: [site],
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
  return {
    currentDreamscape: "node-1",
    screen: { type: "site", siteId: "site-1" },
    visitedSites: [],
    atlas: {
      nodes: { "node-1": node },
      layers: [["node-1"], [], [], [], [], [], []],
      startingNodeId: "node-1",
      bossNodeId: "node-1",
      currentNodeId: "node-1",
      knownDreamsignCarrierIds: [],
    },
    siteRuntime: {
      "site-1": {
        kind: "dreamsignOffer",
        offeredDreamsigns: [makeDreamsign("dreamsign-1")],
        remainingDreamsignPool: [],
        accepted: false,
      },
    },
    remainingDreamsignPool: ["dreamsign-2"],
    essence: 0,
    deck: [],
    dreamAvatar: null,
    dreamsigns: [],
    maxDreamsigns: 12,
  } as unknown as JourneyState;
}

function setJourneyContext(
  state = makeState(),
  tutorialConfiguration?: TutorialSiteConfiguration,
): void {
  vi.mocked(useJourney).mockReturnValue({
    state,
    mutations: {
      ensureDreamsignOfferRuntime: vi.fn(),
      acceptDreamsignOffer: vi.fn(),
      rejectDreamsignOffer: vi.fn(),
    } as unknown as JourneyMutations,
    journeyContent: {
      guides: [GUIDE],
      economyData: economyFixture(),
      sitesData: MINIMAL_SITES_DATA,
      tutorialDreamsignRevelation: tutorialConfiguration,
    } as unknown as JourneyContent,
  } as JourneyContextValue);
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
  loggingMock.emitted.length = 0;
  loggingMock.keys.clear();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  setJourneyContext();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamsignRevelationScreenAdapter", () => {
  it("logs site entry and guide presentation once across equivalent state refreshes", () => {
    const { root } = mount(
      <DreamsignRevelationScreenAdapter siteId="site-1" />,
    );

    expect(screenMock).toHaveBeenCalled();
    expect(loggingMock.emitted).toEqual([
      {
        key: "dreamsign-revelation:site-1:site-entered",
        event: "site_entered",
        fields: {
          siteType: "DreamsignRevelation",
          isEnhanced: false,
          optionCount: 3,
        },
      },
      {
        key: "dreamsign-revelation:site-1:guide:sigrun-guide",
        event: "dream_guide_presented",
        fields: {
          guideId: "sigrun-guide",
          siteType: "DreamsignRevelation",
          isEnhanced: false,
        },
      },
    ]);
    expect(loggingMock.logEventOnce).toHaveBeenNthCalledWith(
      1,
      "dreamsign-revelation:site-1:site-entered",
      "site_entered",
      {
        siteType: "DreamsignRevelation",
        isEnhanced: false,
        optionCount: 3,
      },
    );
    expect(loggingMock.logEventOnce).toHaveBeenNthCalledWith(
      2,
      "dreamsign-revelation:site-1:guide:sigrun-guide",
      "dream_guide_presented",
      {
        guideId: "sigrun-guide",
        siteType: "DreamsignRevelation",
        isEnhanced: false,
      },
    );

    setJourneyContext(makeState());
    act(() => {
      root.render(<DreamsignRevelationScreenAdapter siteId="site-1" />);
    });

    expect(loggingMock.emitted).toHaveLength(2);

    act(() => {
      root.unmount();
    });
  });

  it("logs the resident guide while first-visit Mira guidance is active", () => {
    setJourneyContext(makeState(), TUTORIAL_CONFIGURATION);
    const { root } = mount(
      <DreamsignRevelationScreenAdapter siteId="site-1" />,
    );

    expect(loggingMock.emitted).toContainEqual({
      key: "dreamsign-revelation:site-1:guide:sigrun-guide",
      event: "dream_guide_presented",
      fields: {
        guideId: "sigrun-guide",
        siteType: "DreamsignRevelation",
        isEnhanced: false,
      },
    });

    act(() => {
      root.unmount();
    });
  });
});
