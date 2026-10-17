import { registerDraftContentProvider } from "../../rules/journey/draft";
import { testDraftContentProvider } from "../../rules/journey/test-content-providers";
import { ctx, poolDraftState, stateWithDraftSites } from "../../rules/journey/draft-fixtures";
import { reduceGameEvent } from "../../rules/reducer";
import { journeyDraft } from "../../rules/journey/journey-draft";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { renderInCumulus } from "../../cumulus/testing/render";
import { DraftSiteScreenAdapter } from "./DraftSiteScreenAdapter";
import { journeySites } from "../../rules/journey/journey-sites";
import { createJourneyModifierRegistry, type JourneyModifierRegistry } from "../../rules/journey/modifier-registry";
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
  testCardId,
  testEventActor,
  testDreamscapeId,
  testDreamsignId,
} from "../../types/test-identities";

const modifierLookupMock = vi.hoisted(() => vi.fn<JourneyModifierRegistry["lookup"]>());

const screenMock = vi.hoisted(() =>
  vi.fn<(props: DreamscapeScreenProps) => void>(),
);

vi.mock("../../rules/journey/modifier-registry", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../rules/journey/modifier-registry")>();
  modifierLookupMock.mockImplementation((id) => original.journeyModifierRegistry.lookup(id));
  return { ...original, journeyModifierRegistry: { ...original.journeyModifierRegistry,
    lookup: modifierLookupMock } };
});

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
    cardDatabase: JourneyContent["cardDatabase"] = new Map(),
  ): void {
    vi.mocked(useJourney).mockReturnValue({
      state,
      mutations,
      cardDatabase,
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

  it.each(["Reward", "DreamsignRevelation"] as const)("logs the projected %s overview once and resolves clicks from current holdings", (type) => {
    const source = testDreamsignId("adapter-targeted"), siteId = parseSiteId("adapter-targeted-site");
    const registry = createJourneyModifierRegistry([journeySites(source, {
      kind: "enhanceSiteTypes", siteTypes: ["Reward", "DreamsignRevelation"],
    })]);
    const lookup = modifierLookupMock;
    const previousLookup = lookup.getMockImplementation()!;
    lookup.mockImplementation((id) => registry.lookup(id));
    const state = makeState({ dreamsigns: [{ id: source, name: "Synthetic", effectDescription: "" }], siteRuntime: {} });
    const nodeId = state.currentDreamscape!;
    const node = state.atlas.nodes[nodeId];
    state.atlas = { ...state.atlas, nodes: { ...state.atlas.nodes, [nodeId]: { ...node,
      sites: [{ id: siteId, type, isEnhanced: false, isVisited: false }] } } };
    const mutations = { ensureRewardSiteRuntime: vi.fn(), enterSite: vi.fn() } as unknown as JourneyMutations;
    const root = createRoot(document.createElement("div"));
    try {
      setJourneyContext(mutations, state);
      act(() => root.render(<DreamscapeScreenAdapter />));
      const overview = vi.mocked(logEvent).mock.calls.filter(([name]) => name === "dreamscape_overview_presented");
      expect(overview).toHaveLength(1);
      expect(overview[0][1]).toMatchObject({ sites: [{ siteId, isEnhanced: true }] });
      act(() => lastScreenProps().onSelectSite(siteId));
      expect(logEvent).toHaveBeenCalledWith("site_entered", expect.objectContaining({ siteId, isEnhanced: true }));
      const lost = { ...state, dreamsigns: [] };
      setJourneyContext(mutations, lost);
      act(() => root.render(<DreamscapeScreenAdapter />));
      expect(vi.mocked(logEvent).mock.calls.filter(([name]) => name === "dreamscape_overview_presented")).toHaveLength(1);
      vi.mocked(logEvent).mockClear();
      act(() => lastScreenProps().onSelectSite(siteId));
      expect(logEvent).toHaveBeenCalledWith("site_entered", expect.objectContaining({ siteId, isEnhanced: false }));
      if (type === "Reward") expect(mutations.ensureRewardSiteRuntime).toHaveBeenCalledWith(siteId);
      else expect(mutations.enterSite).toHaveBeenCalledWith(siteId);
      expect(state.atlas.nodes[nodeId].sites[0].isEnhanced).toBe(false);
    } finally {
      act(() => root.unmount());
      lookup.mockImplementation(previousLookup);
    }
  });

  it.each(["holding", "essence", "pool"] as const)("retries failed Draft entry after %s correction without looping or replacing a prepared offer", (correction) => {
    vi.stubGlobal("ResizeObserver", class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    const source = testDreamsignId("adapter-entry-source"), siteId = parseSiteId("site-a");
    const actor = testEventActor("adapter-entry-owner"), sign = { id: source, name: "Synthetic", effectDescription: "" };
    const registry = createJourneyModifierRegistry([journeyDraft(source, {
      kind: "additionalDraftChoices", additionalCards: 2, minimumEssence: 11,
    })]);
    const cards = Array.from({ length: 5 }, (_, index) => makeAuguryTestCard({ id: testCardId(`adapter-entry-${index}`), cardNumber: index + 1 }));
    const database = new Map(cards.map((card) => [card.cardNumber, card]));
    const copies = Object.fromEntries(cards.slice(0, 4).map((card) => [String(card.cardNumber), 1]));
    registerDraftContentProvider(testDraftContentProvider({ cardDatabase: () => database,
      draftConfigFor: () => ({ packSize: 3, sitePickCount: 2, rarityCaps: [] }) }));
    let state = stateWithDraftSites(poolDraftState({ activeSiteId: null, currentOffer: [], siteShownCardNumbers: [],
      draftPoolCopiesByCard: copies, remainingCopiesByCard: copies }), { dreamsigns: [sign], essence: 11,
      screen: { type: "site", siteId } });
    const outcomes: string[] = [];
    const mutations = { enterDraftSite: (id: typeof siteId) => {
      const result = reduceGameEvent(state, { type: "ENTER_DRAFT_SITE", payload: { siteId: id }, actor, clientTimestamp: ctx().timestamp }, ctx(), registry);
      state = result.state; outcomes.push(result.outcome);
    } } as unknown as JourneyMutations;
    const content: Partial<JourneyContent> = { atlasData: MINIMAL_ATLAS_DATA, dreamscapes: MINIMAL_DREAMSCAPES, sitesData: MINIMAL_SITES_DATA,
      tutorial: makeTutorialConfiguration(), draftData: draftDataFixture({ offers: { cardsPerOffer: 3, picksPerSite: 2 } }),
      transfigurationData: transfigurationFixture() };
    const show = () => { setJourneyContext(mutations, state.journey, content, database); };
    show();
    const mounted = renderInCumulus(<DraftSiteScreenAdapter siteId={siteId} />);
    try {
      expect(outcomes).toEqual(["bounced"]);
      show(); mounted.rerender(<DraftSiteScreenAdapter siteId={siteId} />);
      expect(outcomes).toHaveLength(1);
      const type = correction === "holding" ? "REMOVE_DREAMSIGN" : correction === "essence" ? "SET_ESSENCE" : "SET_DRAFT_STATE";
      const expandedCopies = Object.fromEntries(cards.map((card) => [String(card.cardNumber), 1]));
      const payload = correction === "holding" ? { dreamsignId: source } : correction === "essence" ? { value: 0 }
        : { draftState: { ...state.journey.draftState!, draftPoolCopiesByCard: expandedCopies, remainingCopiesByCard: expandedCopies } };
      state = reduceGameEvent(state, { type, payload, actor, clientTimestamp: ctx().timestamp }, ctx(), registry).state;
      show(); mounted.rerender(<DraftSiteScreenAdapter siteId={siteId} />);
      expect(outcomes).toEqual(["bounced", "applied"]);
      const prepared = structuredClone(state.journey.draftState);
      show(); mounted.rerender(<DraftSiteScreenAdapter siteId={siteId} />);
      expect(state.journey.draftState?.currentOffer).toHaveLength(correction === "pool" ? 5 : 3);
      state = reduceGameEvent(state, { type: "SET_ESSENCE", payload: { value: 12 }, actor, clientTimestamp: ctx().timestamp }, ctx(), registry).state;
      state = { ...state, journey: { ...state.journey, dreamsigns: [...state.journey.dreamsigns],
        draftState: structuredClone(state.journey.draftState) } };
      show(); mounted.rerender(<DraftSiteScreenAdapter siteId={siteId} />);
      expect(outcomes).toHaveLength(2);
      expect(state.journey.draftState).toEqual(prepared);
    } finally {
      mounted.unmount(); registerDraftContentProvider(null); vi.unstubAllGlobals();
    }
  });

});
