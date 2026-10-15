// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GambleSiteScreenProps } from "../../cumulus/screens/GambleSiteScreen";
import type { JourneyContent } from "../../data/journey-content";
import { useJourney, type JourneyMutations } from "../../state/journey-context";
import { gambleFixture, testGambleSelectionTrace } from "../../testing/gamble-fixture";
import { testJourneyState } from "../../testing/journey-genesis";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseAtlasNodeId, parseDeckEntryId, parseShuffleCommitment } from "../../types/identifiers";
import type { FourSuitRepriseSiteRuntime, JourneyState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { GambleSiteScreenAdapter } from "./GambleSiteScreenAdapter";
import { GAMBLE_SITE, GUIDE } from "./gamble-site-view-model.fixtures";

vi.mock("../../state/journey-context", () => ({ useJourney: vi.fn() }));
vi.mock("../../logging", () => ({ logEvent: vi.fn(), logEventOnce: vi.fn() }));
const screen = vi.hoisted(() => ({ props: null as GambleSiteScreenProps | null }));
vi.mock("../../cumulus/screens/GambleSiteScreen", () => ({
  GambleSiteScreen: (props: GambleSiteScreenProps) => { screen.props = props; return null; },
}));

const nodeId = parseAtlasNodeId("adapter-gamble-node");
const entryId = parseDeckEntryId("adapter-gamble-target");
function readyRuntime(): FourSuitRepriseSiteRuntime {
  return {
    kind: "gamble", gameId: "four-suit-reprise",
    selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
    isFarpoint: false, drawCost: 25,
    shuffleCommitments: [parseShuffleCommitment("adapter-commitment")],
    committedCards: [{ rank: "7", suit: "hearts" }],
    targets: [], rounds: [], phase: "choose",
  };
}
function stateWith(runtime: FourSuitRepriseSiteRuntime | null): JourneyState {
  return {
    ...testJourneyState("adapter-restored"), essence: 100,
    screen: { type: "site", siteId: GAMBLE_SITE.id }, currentDreamscape: nodeId,
    atlas: {
      nodes: { [nodeId]: {
        id: nodeId, layer: LayerName.One, indexInLayer: 0, dreamscapeId: null,
        sites: [GAMBLE_SITE], position: { x: 0, y: 0 }, state: "available",
        enhancedSiteType: null, forwardIds: [], backwardIds: [], knownDreamsignId: null,
      } },
      layers: [[nodeId], [], [], [], [], [], []], startingNodeId: nodeId,
      bossNodeId: nodeId, currentNodeId: nodeId, knownDreamsignCarrierIds: [],
    },
    siteRuntime: runtime === null ? {} : { [GAMBLE_SITE.id]: runtime },
  };
}
const content = {
  gambleData: gambleFixture(), transfigurationData: transfigurationFixture(), guides: [{ ...GUIDE, dialogue: { "gamble-three-gate": ["Fixture"], "gamble-four-suit-reprise": ["Fixture"] } }],
} as unknown as JourneyContent;
const ensure = vi.fn();
const draw = vi.fn();
const complete = vi.fn();
const mutations = {
  ensureGambleSiteRuntime: ensure, drawFourSuitReprise: draw, completeSite: complete,
} as unknown as JourneyMutations;
let root: Root | null = null;
function supply(state: JourneyState): void {
  vi.mocked(useJourney).mockReturnValue({ state, journeyContent: content, mutations, cardDatabase: new Map() });
}
function render(strict = true): void {
  if (root === null) {
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  }
  const adapter = <GambleSiteScreenAdapter siteId={GAMBLE_SITE.id} gambleGameId="four-suit-reprise" />;
  act(() => root!.render(strict ? <StrictMode>{adapter}</StrictMode> : adapter));
}
function unmount(): void { act(() => root?.unmount()); root = null; }
beforeEach(() => { vi.clearAllMocks(); screen.props = null; });
afterEach(() => { unmount(); document.body.innerHTML = ""; });

describe("GambleSiteScreenAdapter runtime initialization", () => {
  it("uses the restored ready runtime without opening it across refreshes and remounts", () => {
    const runtime = readyRuntime();
    const restored = stateWith(runtime);
    const preserved = structuredClone(restored);
    supply(restored); render();
    expect(screen.props?.view).toMatchObject({ gameId: "four-suit-reprise", runtimeReady: true, phase: "choose" });
    expect(ensure).not.toHaveBeenCalled();
    supply(structuredClone(restored)); render();
    unmount(); supply(structuredClone(restored)); render();
    expect(ensure).not.toHaveBeenCalled();
    act(() => screen.props?.onDrawFourSuit?.(entryId));
    expect(draw).toHaveBeenCalledWith(GAMBLE_SITE.id, entryId);
    act(() => screen.props?.onLeave());
    expect(complete).toHaveBeenCalledWith(GAMBLE_SITE.id, "four-suit-reprise");
    expect(restored).toEqual(preserved);
  });

  it("initializes a genuine absent runtime and uses the subsequently folded runtime", () => {
    supply(stateWith(null));
    render(false);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith(GAMBLE_SITE.id, "four-suit-reprise");
    ensure.mockClear();
    supply(stateWith(readyRuntime())); render(false);
    expect(ensure).not.toHaveBeenCalled();
    expect(screen.props?.view).toMatchObject({ runtimeReady: true, phase: "choose" });
    act(() => screen.props?.onDrawFourSuit?.(entryId));
    expect(draw).toHaveBeenCalledWith(GAMBLE_SITE.id, entryId);
  });
});
