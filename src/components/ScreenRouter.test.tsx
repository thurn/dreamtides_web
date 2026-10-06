// @vitest-environment jsdom

import { StrictMode, act, type ImgHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenRouter } from "./ScreenRouter";
import { JourneyContextProvider } from "../state/journey-context";
import { testJourneyState } from "../testing/journey-genesis";
import type { JourneyMutations } from "../state/journey-context";
import { parseRuntimeConfig } from "../runtime/runtime-config";
import type { JourneyContent } from "../data/journey-content";
import type { DreamGuideContent } from "../types/content";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import type { JourneyState, SiteState } from "../types/journey";
import { LayerName } from "../types/layer-name";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestDreamsignTemplate,
  makeAuguryTestJourneyState,
} from "../journey_v2/testing/fixtures";
import { getLogEntries, resetLog } from "../logging";
import type { AuguryArchetypeId } from "../journey_v2";
import {
  parseAtlasNodeId,
  parseBattleId,
  parseDeckEntryId,
  parseShuffleCommitment,
  parseSiteId,
} from "../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testDreamscapeId,
  testDreamsignId,
  testExplorationActionId,
  testJourneySeed,
} from "../types/test-identities";

const motionPreference = vi.hoisted(() => ({ reduced: false, isPresent: true }));

vi.mock("framer-motion", () => {
  type Props = { children?: ReactNode; [key: string]: unknown };
  return {
    AnimatePresence: ({ children, mode }: { children: ReactNode; mode?: string }) => (
      <div data-animate-presence-mode={mode}>{children}</div>
    ),
    useReducedMotion: () => motionPreference.reduced,
    useIsPresent: () => motionPreference.isPresent,
    motion: {
      div: ({ children, exit, ...props }: Props & { exit?: { pointerEvents?: string } }) => (
        <div {...props} data-exit-pointer-events={exit?.pointerEvents}>
          {children}
        </div>
      ),
      img: ({
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...props
      }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => <img {...props} />,
      main: ({ children, ...props }: Props) => <main {...props}>{children}</main>,
      section: ({ children, ...props }: Props) => <section {...props}>{children}</section>,
    },
  };
});

vi.mock("./BattleSiteRoute", () => ({
  BattleSiteRoute: ({ site }: { site: SiteState }) => (
    <div data-testid="battle-site-route" data-site-id={site.id} />
  ),
}));

const roots: Root[] = [];

beforeEach(() => {
  motionPreference.reduced = false;
  motionPreference.isPresent = true;
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.clearAllMocks();
  resetLog();
});

function card(idSeed: string, cardNumber: number, overrides: Partial<CardData> = {}): CardData {
  return makeAuguryTestCard({
    id: testCardId(idSeed),
    cardNumber,
    name: parseCardName(`Router Fixture ${cardNumber}`),
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

/** Deck cards (1-6) plus draw, recursion, interaction and early-curve cards. */
const FIXTURE_CARDS: ReadonlyArray<readonly [number, Partial<CardData>]> = [
  [1, { cardType: "Event", energyCost: 5, spark: null, renderedText: "Fast." }],
  [2, { energyCost: 5, spark: 4 }],
  [3, { energyCost: 4 }],
  [4, { energyCost: 4 }],
  [5, { energyCost: 3 }],
  [6, { energyCost: 3 }],
  [101, { renderedText: "Draw a card." }],
  [102, { renderedText: "Draw two cards." }],
  [103, { renderedText: "When this enters, draw a card." }],
  [201, { renderedText: "Reclaim 1." }],
  [202, { renderedText: "Return a card from your void to your hand." }],
  [301, { renderedText: "Banish an enemy." }],
  [302, { renderedText: "Prevent the next damage." }],
  [401, { energyCost: 1 }],
  [402, { energyCost: 1 }],
];

function auguryContent(
  { cards, withDreamsigns = true }: { cards?: CardData[]; withDreamsigns?: boolean } = {},
): JourneyContent {
  const content = makeAuguryTestContent({
    cards:
      cards ??
      FIXTURE_CARDS.map(([n, overrides]) =>
        card(`71000000-0000-4000-8000-${String(n).padStart(12, "0")}`, n, overrides),
      ),
    dreamsignTemplates: withDreamsigns
      ? ["router-sign-a", "router-sign-b"].map((seed) =>
          makeAuguryTestDreamsignTemplate({ id: testDreamsignId(seed), name: seed }),
        )
      : [],
  });
  const guides = Object.entries(content.sitesData.guideAssignments).map(
    ([siteType, assignment]): DreamGuideContent => ({
      id: assignment.guideId,
      name: `Fixture ${siteType} Guide`,
      homeDreamscapeId: assignment.homeDreamscapeId,
      siteType: siteType as DreamGuideContent["siteType"],
      portraitSource: "fixture-guide.png",
      dialogue: { site: ["Fixture."], "random-site": ["Fixture."], "gamble-three-gate": ["Fixture."] },
      homeSpecialty: "Fixture specialty",
    }),
  );
  return { ...content, guides };
}

/** Every mutation is a lazily created spy, so routes may call any intent. */
function makeMutations(): JourneyMutations {
  const spies = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy({} as JourneyMutations, {
    get(_target, key) {
      if (typeof key !== "string" || key === "then" || key === "toJSON") return undefined;
      const spy = spies.get(key) ?? vi.fn();
      spies.set(key, spy);
      return spy;
    },
  });
}

function makeSite(type: SiteState["type"]): SiteState {
  return { id: parseSiteId("router-site"), type, isEnhanced: false, isVisited: false };
}

function makeStateFor(site: SiteState): JourneyState {
  const nodeId = parseAtlasNodeId("dreamscape-router");
  const base = makeAuguryTestJourneyState({
    seed: testJourneySeed("router-augury-seed"),
    essence: 180,
    deck: [1, 2, 3, 4, 5, 6].map((cardNumber) =>
      makeAuguryTestDeckEntry({ entryId: parseDeckEntryId(`router-entry-${cardNumber}`), cardNumber }),
    ),
  });
  const node = {
    id: nodeId, layer: LayerName.One, indexInLayer: 0, position: { x: 0, y: 0 },
    dreamscapeId: testDreamscapeId("test_dreamscape"), state: "available" as const,
    enhancedSiteType: null, forwardIds: [], backwardIds: [], knownDreamsignId: null,
    sites: [site],
  };
  return {
    ...base,
    currentDreamscape: nodeId,
    screen: { type: "site", siteId: site.id },
    atlas: { ...testJourneyState().atlas, startingNodeId: nodeId, nodes: { [nodeId]: node } },
  };
}

function mountRouter(options: {
  state: JourneyState;
  journeyContent?: JourneyContent;
  query?: string;
  strict?: boolean;
}) {
  const { state, journeyContent = auguryContent(), query = "", strict = false } = options;
  const mutations = makeMutations();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const renderTree = (nextState: JourneyState, nextMutations: JourneyMutations) => {
    const { cardDatabase } = journeyContent;
    const value = { state: nextState, mutations: nextMutations, cardDatabase, journeyContent };
    const tree = (
      <CumulusRoot>
        <JourneyContextProvider value={value}>
          <ScreenRouter runtimeConfig={parseRuntimeConfig(query)} />
        </JourneyContextProvider>
      </CumulusRoot>
    );
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  };
  act(() => renderTree(state, mutations));
  const rerender = async (nextState: JourneyState, nextMutations: JourneyMutations) => {
    await act(async () => {
      renderTree(nextState, nextMutations);
      await Promise.resolve();
    });
  };
  return { container, mutations, rerender };
}

function click(element: Element | null | undefined): void {
  if (!(element instanceof HTMLElement)) throw new Error("expected a clickable element");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function logs(event: string) {
  return getLogEntries().filter((entry) => entry.event === event);
}

const fixtureAvatar = (uuid: string) => ({
  id: testAvatarId(uuid), name: "Avatar Fixture", title: "Keeper of Tests",
  renderedText: "", imageNumber: "0001", startingEssence: 180,
});

describe("ScreenRouter route transitions", () => {
  it("mounts the next route without waiting and makes an exiting route inert", () => {
    const { container } = mountRouter({ state: makeStateFor(makeSite("Augury")) });
    const presence = container.querySelector("[data-animate-presence-mode]");
    expect(presence?.getAttribute("data-animate-presence-mode")).toBe("sync");
    const screen = container.querySelector("[data-journey-screen]");
    expect(screen?.getAttribute("data-exit-pointer-events")).toBe("none");

    motionPreference.isPresent = false;
    const exiting = mountRouter({ state: makeStateFor(makeSite("Augury")) }).container;
    const frame = exiting.querySelector<HTMLElement>("[data-journey-screen]");
    expect(frame?.dataset.journeyScreenPresence).toBe("exiting");
    expect(frame?.hasAttribute("inert")).toBe(true);
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("ScreenRouter Augury routing", () => {
  it("renders the Augury screen and logs the screen and encounter once under StrictMode", () => {
    const site = makeSite("Augury");
    const { container } = mountRouter({ state: makeStateFor(site), strict: true });

    expect(container.querySelector('[data-testid="cumulus-augury-site-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cumulus-augury-offer-A"]')).not.toBeNull();
    expect(logs("screen_rendered")).toHaveLength(1);
    expect(logs("screen_rendered")[0]).toMatchObject({ screenType: "site", siteId: site.id });

    const encounterLogs = logs("augury_encounter_generated");
    expect(encounterLogs).toHaveLength(1);
    const encounter = encounterLogs[0];
    const signature = encounter?.encounterSignature;
    expect(signature).toBeDefined();
    const offerLogs = logs("augury_offer_built");
    expect(offerLogs).toHaveLength(2);
    const deckHash = (encounter?.deck as { hash?: unknown } | undefined)?.hash;
    for (const offer of offerLogs) {
      expect(offer).toMatchObject({ encounterSignature: signature, deckHash });
    }
    expect(new Set(offerLogs.map((offer) => offer.offerId))).toEqual(new Set(["A", "B"]));
  });

  it("adds reroll and force-category debug commands to the journey menu", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    state.avatar = fixtureAvatar("72000000-0000-4000-8000-000000000001");
    const { container, mutations } = mountRouter({ state });
    const openMenu = () => click(container.querySelector('[data-testid="dreamscape-menu-button"]'));
    const menuRow = (action: string) =>
      container.querySelector(`[role="menuitem"][data-command-menu-action-id="${action}"]`);

    openMenu();
    click(menuRow("rerollJourney"));
    expect(mutations.rerollAugury).toHaveBeenCalledWith(site.id);

    const debug = logs("augury_encounter_generated")[0]?.debug as
      | { eligibleArchetypeIds?: AuguryArchetypeId[] }
      | undefined;
    const eligible = debug?.eligibleArchetypeIds?.[0];
    if (eligible === undefined) throw new Error("expected an eligible archetype");
    openMenu();
    click(menuRow("forceJourneyCategory"));
    expect(menuRow("forceJourneyCategory:clear")).not.toBeNull();
    click(menuRow(`forceJourneyCategory:${eligible}`));
    expect(mutations.forceAuguryArchetype).toHaveBeenCalledWith(site.id, eligible);
  });

  it("publishes card source debug for grant cards once, through StrictMode and the fold", async () => {
    // No dreamsigns and an empty deck leave only the face-up card grant
    // families eligible, so the encounter surfaces catalog grant cards.
    const state = { ...makeStateFor(makeSite("Augury")), deck: [] };
    const mounted = mountRouter({
      state,
      journeyContent: auguryContent({ withDreamsigns: false }),
      strict: true,
    });
    const publish = vi.mocked(mounted.mutations.setCardSourceDebug);
    expect(publish).toHaveBeenCalledTimes(1);
    const [published, source] = publish.mock.calls[0] ?? [];
    expect(source).toBe("augury_grant_cards_shown");
    expect(published?.surface).toBe("Reward");
    expect(published?.entries.some((entry) => typeof entry.cardNumber === "number")).toBe(true);

    const foldedMutations = makeMutations();
    await mounted.rerender({ ...state, cardSourceDebug: published ?? null }, foldedMutations);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(foldedMutations.setCardSourceDebug).not.toHaveBeenCalled();
  });

  it("walks away from a contained fallback when augury generation is unavailable", () => {
    const site = makeSite("Augury");
    const { container, mutations } = mountRouter({
      state: makeStateFor(site),
      journeyContent: auguryContent({ cards: [], withDreamsigns: false }),
    });
    click(container.querySelector('[data-testid="cumulus-augury-unavailable-exit"]'));
    expect(mutations.completeAugurySite).toHaveBeenCalledWith(site.id);
  });

  it("fails closed when persisted state targets an inline-only site", () => {
    const { container } = mountRouter({ state: makeStateFor(makeSite("Reward")) });
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();
  });
});

describe("ScreenRouter terminal routing", () => {
  it("renders Journey Failed with the utility menu, no status bar, and the reset intent", () => {
    const state = testJourneyState();
    const battleId = parseBattleId("router-failure-battle");
    const siteId = parseSiteId("router-failure-site");
    state.screen = { type: "journeyFailed" };
    state.completionLevel = 2;
    state.avatar = fixtureAvatar("73000000-0000-4000-8000-000000000001");
    state.failureSummary = {
      battleId, siteId, result: "defeat", reason: "score_target_reached", siteLabel: "Battle",
      dreamscapeIdOrNone: parseAtlasNodeId("router-failure-dreamscape"),
      turnNumber: 6, playerScore: 4, enemyScore: 10,
    };
    const { container, mutations } = mountRouter({ state });

    expect(container.querySelector('[data-testid="cumulus-journey-failed-screen"]')).not.toBeNull();
    expect(container.querySelector("[data-journey-status-bar-anchor]")).toBeNull();
    expect(container.querySelector('[data-testid="dreamscape-menu-button"]')).not.toBeNull();
    expect(logs("journey_failed_screen_shown")[0]).toMatchObject({ battleId, siteId });

    click(container.querySelector('[data-testid="journey-failed-start-new-run"]'));
    expect(mutations.resetJourney).toHaveBeenCalledOnce();
    expect(logs("journey_failed_start_new_run")[0]).toMatchObject({ battleId, result: "defeat" });
  });
});

describe("ScreenRouter site dispatch", () => {
  it("keeps a battle site route renderable while the active atlas node advances", () => {
    const site = makeSite("Battle");
    const state = makeStateFor(site);
    const siteNode = state.atlas.nodes[parseAtlasNodeId("dreamscape-router")];
    if (siteNode === undefined) throw new Error("expected fixture site node");
    const nextId = parseAtlasNodeId("next-dreamscape");
    state.atlas.nodes[nextId] = { ...siteNode, id: nextId, sites: [] };
    state.currentDreamscape = nextId;
    const { container } = mountRouter({ state });

    const route = container.querySelector('[data-testid="battle-site-route"]');
    expect(route?.getAttribute("data-site-id")).toBe(site.id);
  });

  it("routes RandomSite to the guide's choice screen and emits the chosen site type", () => {
    motionPreference.reduced = true;
    const candidates = ["Shop", "Purge", "Augury"] as const;
    const site: SiteState = {
      ...makeSite("RandomSite"),
      isEnhanced: true,
      randomSite: { mode: "homeChoice", candidateSiteTypes: [...candidates] },
    };
    const state = makeStateFor(site);
    state.siteRuntime[site.id] = {
      kind: "randomSite",
      offeredSiteTypes: [...candidates],
      selectedSiteType: null,
    };
    const { container, mutations } = mountRouter({ state });

    expect(container.querySelectorAll("[data-random-site-choice]")).toHaveLength(3);
    click(container.querySelector("[data-random-site-choice] button"));
    expect(mutations.chooseRandomSite).toHaveBeenCalledWith(site.id, "Shop");
  });

  it("routes Gamble to the Three-Gate Wager and passes a forced URL game into initialization", () => {
    const site = makeSite("Gamble");
    const state = makeStateFor(site);
    state.siteRuntime = {
      [site.id]: {
        kind: "gamble", gameId: "gravok-three-gate-wager", roundNumber: 1, isFarpoint: false,
        wagerCost: 50, shuffleCommitment: parseShuffleCommitment("fixture-commitment"),
        committedCard: { rank: "A", suit: "spades" },
        dreamsignCandidateIds: [], rewardDreamsign: null, result: null,
      },
    };
    const { container, mutations } = mountRouter({ state });
    expect(container.querySelectorAll("[data-gamble-gates] [data-gamble-gate]")).toHaveLength(3);
    const chooseSix = container.querySelector('[data-testid="gamble-choose-six"]');
    expect(chooseSix).toBeInstanceOf(HTMLButtonElement);
    expect(mutations.ensureGambleSiteRuntime).toHaveBeenCalledWith(site.id, undefined);

    const forced = mountRouter({ state: makeStateFor(site), query: "?gambleGame=ladder-climb" });
    expect(forced.mutations.ensureGambleSiteRuntime).toHaveBeenCalledWith(
      site.id,
      "tidemark-ladder-climb",
    );
  });

  it("routes Exploration to its screen and logs and emits the chosen action", () => {
    motionPreference.reduced = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute("data-exploration-card-slot")) return new DOMRect(900, 180, 240, 336);
      if (this instanceof HTMLImageElement && this.alt !== "") return new DOMRect(780, 150, 480, 291);
      return new DOMRect(0, 0, 100, 100);
    });
    const site = makeSite("Exploration");
    const journeyContent = auguryContent();
    const selected = card("161482b6-af07-4d9e-822d-8c738672beb9", 901);
    journeyContent.cardDatabase.set(selected.cardNumber, selected);
    const actionIds = ["action-a", "action-b"].map((id) => testExplorationActionId(id));
    const actions = actionIds.map((id) => ({
      id, label: "Fixture action", effectText: "Fixture effect.",
      effectKind: "gain-card" as const, cardId: selected.id,
    }));
    journeyContent.exploration = {
      customCards: [],
      customDreamsigns: [],
      encounters: [{ cardId: selected.id, prose: "Fixture prose.", actions }],
    };
    const state = makeStateFor(site);
    state.siteRuntime[site.id] = {
      kind: "exploration",
      encounterCardId: selected.id,
      actionOffers: actionIds.map((actionId) => ({
        actionId, offeredCardIds: [], packCardIds: [],
        replacementCardIdByEntryId: {}, transfigurationByEntryId: {},
      })),
      resolution: null,
    };
    const { container, mutations } = mountRouter({ state, journeyContent });
    expect(container.querySelector('[data-testid="cumulus-exploration-site-screen"]')).not.toBeNull();

    click(container.querySelector('[data-testid="cumulus-exploration-channel"]'));
    const siteId = site.id;
    expect(logs("exploration_frame_break_started")[0]).toMatchObject({ siteId, cardId: selected.id });

    const choice = '[data-testid="cumulus-exploration-choice-0"] [data-exploration-action-id]';
    click(container.querySelector(choice));
    expect(mutations.resolveExplorationChoice).toHaveBeenCalledWith(siteId, actionIds[0], undefined);
    expect(logs("exploration_choice_requested")[0]).toMatchObject({
      siteId,
      presentedCardId: selected.id,
      actionId: actionIds[0],
    });
  });
});
