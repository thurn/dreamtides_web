// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamsignRevelationScreenAdapter } from "./DreamsignRevelationScreenAdapter";
import { useQuest } from "../../state/quest-context";
import type { QuestContent } from "../../data/quest-content";
import type {
  QuestContextValue,
  QuestMutations,
} from "../../state/quest-context";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, Dreamsign, QuestState } from "../../types/quest";
import { LayerName } from "../../types/layer-name";

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

vi.mock("../../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEventOnce: loggingMock.logEventOnce,
}));

vi.mock("../../tango/screens/DreamsignRevelationScreen", () => ({
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
  dialog: ["Choose what the frost reveals."],
  homeSpecialty: "Dreamsign Revelation",
};

function makeDreamsign(id: string): Dreamsign {
  return {
    id,
    name: `Dreamsign ${id}`,
    effectDescription: "Drawn from the test pool.",
    imageName: `${id}.png`,
    imageAlt: `Dreamsign ${id}`,
    isBane: false,
  };
}

function makeState(): QuestState {
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
    biomeColor: "test-biome-color",
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
    dreamcaller: null,
    dreamsigns: [],
    maxDreamsigns: 12,
  } as unknown as QuestState;
}

function setQuestContext(state = makeState()): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: {
      ensureDreamsignOfferRuntime: vi.fn(),
      acceptDreamsignOffer: vi.fn(),
      rejectDreamsignOffer: vi.fn(),
    } as unknown as QuestMutations,
    questContent: {
      guides: [GUIDE],
    } as unknown as QuestContent,
  } as QuestContextValue);
}

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
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
  setQuestContext();
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
          ui: "tango",
        },
      },
      {
        key: "dreamsign-revelation:site-1:guide:sigrun-guide",
        event: "dream_guide_presented",
        fields: {
          guideId: "sigrun-guide",
          siteType: "DreamsignRevelation",
          isEnhanced: false,
          ui: "tango",
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
        ui: "tango",
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
        ui: "tango",
      },
    );

    setQuestContext(makeState());
    act(() => {
      root.render(<DreamsignRevelationScreenAdapter siteId="site-1" />);
    });

    expect(loggingMock.emitted).toHaveLength(2);

    act(() => {
      root.unmount();
    });
  });
});
