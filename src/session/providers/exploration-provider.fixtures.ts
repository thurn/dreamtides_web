// Scenario, fold, and forgery helpers for the Exploration provider tests,
// with the per-case contract every plan family's case runs.

import { expect } from "vitest";
import type { ExplorationActionContent } from "../../data/exploration";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { foldEvents } from "../../eventlog/fold";
import type { GameEvent, Genesis } from "../../eventlog/types";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { stableDigest } from "../../reward-selection/stable";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { GAME_ENGINE_CONFIG } from "../../rules/replay/replay";
import {
  makeTestAtlasNode,
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../testing/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { economyFixture } from "../../testing/economy-fixture";
import {
  TEST_CONTENT_CONFIG,
  testJourneyState,
} from "../../testing/journey-genesis";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import {
  parseAtlasNodeId,
  parseDeckEntryId,
  parseSiteId,
} from "../../types/identifiers";
import type {
  ExplorationActionOfferRuntime as Offer,
  ExplorationSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import {
  testCardId,
  testCardSubtype,
  testDreamsignId,
  testEventActor,
  testExplorationActionId,
  testFoldHash,
  testJourneySeed,
} from "../../types/test-identities";
import { buildExplorationRuntime } from "./exploration-provider";
import { createSiteContentProvider } from "./site-provider";

export const SOURCE_CARD_ID = testCardId("161482b6-af07-4d9e-822d-8c738672beb9");
export const NODE_ID = parseAtlasNodeId("exploration-node");
export const site: SiteState = {
  id: parseSiteId("exploration-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function card(
  cardNumber: number,
  cardType: CardData["cardType"],
  subtype: Parameters<typeof testCardSubtype>[0],
  isStarter = false,
  id = `f0000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
): CardData {
  return {
    id: testCardId(id),
    name: parseCardName(`Exploration fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: testCardSubtype(subtype),
    isStarter,
    ...(isStarter ? { roles: ["starter-deck" as const] } : {}),
    energyCost: cardNumber === 1 ? 1 : 2,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText: "Synthetic rules text.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

type Action = ExplorationActionContent;
export function action(idSeed: string, fields: Omit<Action, "id" | "label">): Action {
  return { id: testExplorationActionId(idSeed), label: "Fixture", ...fields };
}

/** Deck: four starter Events (101) and four starter Characters (130). */
function scenario(primary: Action, essence = 100) {
  const cards = [
    card(1, "Character", "Warrior", false, SOURCE_CARD_ID),
    card(2, "Event", "", false, NIGHTMARE_CARD_ID),
    card(101, "Event", "", true),
    card(130, "Character", "Spirit Animal", true),
    ...[120, 121, 122, 123].map((n) => card(n, "Character", "Warrior")),
    ...[131, 132, 133].map((n) => card(n, "Character", "Spirit Animal")),
  ];
  const dreamsigns = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    id: testDreamsignId(`d0000000-0000-4000-8000-00000000000${String(i)}`),
    name: `Dreamsign ${String(i)}`,
    effectDescription: "A fixture effect.",
  }));
  const dreamsignIds = dreamsigns.map(({ id }) => id);
  const fallback = action("fallback", {
    effectKind: "gain-card",
    cardId: SOURCE_CARD_ID,
  });
  const content: JourneyContent = {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    exploration: {
      foldHash: testFoldHash("a"),
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: SOURCE_CARD_ID,
          prose: "A scene.",
          actions: [primary, fallback],
        },
      ],
    },
    avatars: [],
    dreamwellCards: [],
    dreamsignTemplates: dreamsigns,
    dreamscapes: [],
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
  const base = testJourneyState();
  const journey: JourneyState = {
    ...base,
    essence,
    maxDreamsigns: 4,
    deck: Array.from({ length: 8 }, (_, i) => ({
      entryId: parseDeckEntryId(`entry-${String(i)}`),
      cardNumber: i % 2 === 0 ? 101 : 130,
      transfiguration: null,
      isBane: false,
    })),
    remainingDreamsignPool: [...dreamsignIds],
    currentDreamscape: NODE_ID,
    atlas: {
      ...base.atlas,
      nodes: { [NODE_ID]: makeTestAtlasNode(NODE_ID, [site]) },
      startingNodeId: NODE_ID,
      currentNodeId: NODE_ID,
    },
  };
  return { content, journey };
}
type Scenario = ReturnType<typeof scenario>;

const genesis: Genesis = {
  seed: testJourneySeed("exploration-provider-fold"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};

/** A logged event; its payload takes the JSON shape the log persists. */
function logged(seq: number, type: GameEvent["type"], payload: object) {
  const event: GameEvent = {
    type,
    payload: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
    actor: testEventActor(seq % 2 === 0 ? "client-a" : "client-b"),
    clientTimestamp: new Date(seq * 1000).toISOString(),
    basedOnSeq: seq - 1,
  };
  return { seq, event };
}
type Logged = ReturnType<typeof logged>;

const OPEN = logged(1, "OPEN_SITE", {
  siteId: site.id,
  selectionRulesVersion: SELECTION_RULES_VERSION,
});

function resolveEvent(seq: number, a: Action, selection: unknown, extra = {}) {
  return logged(seq, "RESOLVE_EXPLORATION_CHOICE", {
    siteId: site.id,
    actionId: a.id,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selection,
    ...extra,
  });
}

function fold({ content, journey }: Scenario, events: Logged[], seq = 0) {
  registerSiteContentProvider(createSiteContentProvider(content));
  try {
    const state = { ...GAME_ENGINE_CONFIG.genesisState(genesis), journey };
    return foldEvents(GAME_ENGINE_CONFIG, genesis, { seq, state }, events, {
      devMode: true,
    });
  } finally {
    registerSiteContentProvider(null);
  }
}

export function runtimeOf(journey: JourneyState): ExplorationSiteRuntime {
  const runtime = journey.siteRuntime[site.id];
  if (runtime?.kind !== "exploration") throw new Error("Expected a runtime");
  return runtime;
}

/** Opens the site through the reducer; returns the journey and its offer. */
function opened(s: Scenario): Scenario & { offer: Offer } {
  const result = fold(s, [OPEN]);
  expect(result.outcomes[0]?.outcome).toBe("applied");
  const journey = result.state.journey;
  return { ...s, journey, offer: req(runtimeOf(journey).actionOffers[0]) };
}

function withOffer(journey: JourneyState, patch: Partial<Offer>) {
  const runtime = runtimeOf(journey);
  const [offer, ...rest] = runtime.actionOffers;
  const actionOffers = [{ ...req(offer), ...patch }, ...rest];
  return {
    ...journey,
    siteRuntime: { [site.id]: { ...runtime, actionOffers } },
  };
}

export function req<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a fixture value");
  return value;
}

type Select = (offer: Offer) => object;
type Forge = (
  journey: JourneyState,
  offer: Offer,
  selection: object,
) => { journey?: JourneyState; payload?: object };

export interface Case {
  name: string;
  primary: Action;
  essence?: number;
  select?: Select;
  effect: (before: JourneyState, after: JourneyState, offer: Offer) => void;
  forgeries: Record<string, Forge>;
}

export const offerPatch =
  (patch: (offer: Offer) => Partial<Offer>): Forge =>
  (journey, offer) => ({ journey: withOffer(journey, patch(offer)) });
type JourneyChange = (journey: JourneyState, o: Offer) => Partial<JourneyState>;
export const journeyPatch =
  (patch: JourneyChange): Forge =>
  (journey, offer) => ({ journey: { ...journey, ...patch(journey, offer) } });
export const payload =
  (value: object): Forge =>
  () => ({ payload: value });

export const forgedPlan = stableDigest("forged-plan");

/**
 * One plan family's provider contract: the plan is a function of the journey
 * seed, a resolution folds through the reducer once and replays identically,
 * and each forgery bounces without mutating the journey.
 */
export function expectProviderCase({
  primary,
  essence,
  select,
  effect,
  forgeries,
}: Case): void {
  const s = scenario(primary, essence);
  const prepare = (draw: number) =>
    buildExplorationRuntime(s.journey, site, s.content, () => draw);
  expect(prepare(0.01)).not.toBeNull();
  expect(prepare(0.99)).toEqual(prepare(0.01));

  const unsupported = logged(1, "OPEN_SITE", {
    siteId: site.id,
    selectionRulesVersion: "unsupported",
  });
  expect(fold(s, [unsupported]).outcomes[0]?.outcome).toBe("bounced");
  const open = opened(s);
  const selection = (select ?? (() => ({})))(open.offer);
  const events = [
    OPEN,
    resolveEvent(2, primary, selection),
    resolveEvent(3, primary, selection),
  ];
  const first = fold(s, events);
  expect(first.outcomes.map(({ outcome }) => outcome)).toEqual([
    "applied",
    "applied",
    "bounced",
  ]);
  expect(fold(s, events).state).toEqual(first.state);
  expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
  const resolution = runtimeOf(first.state.journey).resolution;
  expect(resolution?.selection).toEqual(selection);
  expect(resolution?.selectionSignature).toBe(
    open.offer.selectionSignature,
  );
  effect(open.journey, first.state.journey, open.offer);

  for (const [forgery, forge] of Object.entries(forgeries)) {
    const forged = forge(open.journey, open.offer, selection);
    const journey = forged.journey ?? open.journey;
    const before = structuredClone(journey);
    const event = resolveEvent(2, primary, selection, forged.payload);
    const result = fold({ ...open, journey }, [event], 1);
    expect(result.outcomes[0]?.outcome, forgery).toBe("bounced");
    expect(result.state.journey, forgery).toEqual(before);
  }
}
