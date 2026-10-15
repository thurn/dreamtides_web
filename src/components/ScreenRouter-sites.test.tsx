// @vitest-environment jsdom

import { act, type ImgHTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testJourneyState } from "../testing/journey-genesis";
import type { SiteState } from "../types/journey";
import { resetLog } from "../logging";
import {
  parseAtlasNodeId,
  parseBattleId,
  parseShuffleCommitment,
  parseSiteId,
} from "../types/identifiers";
import { testExplorationActionId, testFoldHash } from "../types/test-identities";
import { SELECTION_RULES_VERSION } from "../reward-selection";
import { testGambleSelectionTrace } from "../testing/gamble-fixture";
import {
  roots,
  card,
  auguryContent,
  makeSite,
  makeStateFor,
  mountRouter,
  click,
  logs,
  fixtureAvatar,
} from "./screen-router-test-fixtures";

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
      div: ({ children, exit, ...props }: Props & { exit?: Record<string, unknown> }) => (
        <div {...props} data-exit-keys={exit === undefined ? undefined : Object.keys(exit).join(" ")}>
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
      nodeIdOrNone: parseAtlasNodeId("router-failure-dreamscape"),
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
        kind: "gamble", gameId: "gravok-three-gate-wager",
        selectionTrace: testGambleSelectionTrace("gravok-three-gate-wager"),
        roundNumber: 1, isFarpoint: false,
        wagerCost: 50, shuffleCommitment: parseShuffleCommitment("fixture-commitment"),
        committedCard: { rank: "A", suit: "spades" },
        dreamsignCandidateIds: [], rewardDreamsign: null, result: null,
      },
    };
    const { container, mutations } = mountRouter({ state });
    expect(container.querySelectorAll("[data-gamble-gates] [data-gamble-gate]")).toHaveLength(3);
    const chooseSix = container.querySelector('[data-testid="gamble-choose-six"]');
    expect(chooseSix).toBeInstanceOf(HTMLButtonElement);
    expect(mutations.ensureGambleSiteRuntime).not.toHaveBeenCalled();

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
      foldHash: testFoldHash("e"),
      customCards: [],
      customDreamsigns: [],
      encounters: [{ cardId: selected.id, prose: "Fixture prose.", actions }],
    };
    const state = makeStateFor(site);
    state.siteRuntime[site.id] = {
      kind: "exploration",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      encounterCardId: selected.id,
      actionOffers: actionIds.map((actionId) => ({
        actionId, canonicalMechanicId: "gain-card", offeredCardIds: [], packCardIds: [],
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
    expect(mutations.resolveExplorationChoice).toHaveBeenCalledWith(siteId, actionIds[0], undefined, selected.id, 0);
    expect(logs("exploration_choice_requested")[0]).toMatchObject({
      siteId,
      presentedCardId: selected.id,
      actionId: actionIds[0],
    });
  });
});
