// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { describe, expect, it, vi } from "vitest";
import { DreamscapeScreen } from "./DreamscapeScreen";
import { useQuest } from "../state/quest-context";
import type { QuestState, SiteState } from "../types/quest";

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

/** Builds a single-dreamscape quest state with the given sites. */
function makeState(sites: SiteState[]): QuestState {
  return {
    completionLevel: 0,
    atlas: {
      nodes: {
        "dreamscape-1": {
          id: "dreamscape-1",
          layer: 0,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          biomeName: "Crystal Spire",
          biomeColor: "#38bdf8",
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
          position: { x: 0, y: 0 },
          sites,
        },
      },
      startingNodeId: "dreamscape-1",
      bossNodeId: "dreamscape-1",
      currentNodeId: "dreamscape-1",
      layers: [],
      knownDreamsignCarrierIds: [],
    },
    currentDreamscape: "dreamscape-1",
    screen: { type: "dreamscape" },
  } as unknown as QuestState;
}

/** Mounts the screen with a mocked quest context for the given sites. */
function renderScreen(sites: SiteState[]): string {
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(sites),
    mutations: { setScreen: vi.fn() },
  } as unknown as ReturnType<typeof useQuest>);
  return renderToStaticMarkup(<CumulusRoot><DreamscapeScreen /></CumulusRoot>);
}

const DRAFT: SiteState = { id: "site-1", type: "Draft", isEnhanced: false, isVisited: false };
const REWARD: SiteState = { id: "site-2", type: "Reward", isEnhanced: false, isVisited: false };
const BATTLE: SiteState = { id: "site-3", type: "Battle", isEnhanced: false, isVisited: false };

describe("DreamscapeScreen", () => {
  it("renders the dreamscape scene art and title", () => {
    const html = renderScreen([DRAFT, REWARD, BATTLE]);
    expect(html).toContain("Crystal Spire");
    expect(html).toContain("/dreamscapes/test_dreamscape.png");
  });

  it("renders one node button per site", () => {
    const html = renderScreen([DRAFT, REWARD, BATTLE]);
    expect(html).toContain('data-site-id="site-1"');
    expect(html).toContain('data-site-id="site-2"');
    expect(html).toContain('data-site-id="site-3"');
  });

  it("locks the guardian battle while other sites remain unvisited", () => {
    const html = renderScreen([DRAFT, REWARD, BATTLE]);
    // The battle node is locked until the other sites are visited.
    expect(html).toContain('data-site-type="Battle"');
    expect(html).toMatch(/data-site-type="Battle"[^>]*data-site-locked="true"/);
    expect(html).toContain('data-battle-unlocked="false"');
  });

  it("unlocks the guardian once all non-battle sites are visited", () => {
    const html = renderScreen([
      { ...DRAFT, isVisited: true },
      { ...REWARD, isVisited: true },
      BATTLE,
    ]);
    expect(html).toMatch(/data-site-type="Battle"[^>]*data-site-locked="false"/);
    expect(html).toContain('data-battle-unlocked="true"');
  });
});
