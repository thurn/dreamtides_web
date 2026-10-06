import { describe, expect, it } from "vitest";
import type { ExplorationActionContent } from "../../data/exploration";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { foldEvents } from "../../eventlog/fold";
import type { GameEvent, Genesis } from "../../eventlog/types";
import {
  parseSelectionRulesVersion,
  SELECTION_RULES_VERSION,
} from "../../reward-selection";
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
import type { DeckEntryId } from "../../types/identifiers";
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

// Provider contracts, one case per plan family: the plan is a function of the
// journey seed, a resolution folds through the reducer once and replays
// identically, and a forged plan, forged intent, or stale journey bounces
// without mutating the journey. Plan selection rules live in the
// src/exploration/*-plan tests.

const SOURCE_CARD_ID = testCardId("161482b6-af07-4d9e-822d-8c738672beb9");
const NODE_ID = parseAtlasNodeId("exploration-node");
const site: SiteState = {
  id: parseSiteId("exploration-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function card(
  cardNumber: number,
  cardType: CardData["cardType"],
  subtype: string,
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
function action(idSeed: string, fields: Omit<Action, "id" | "label">): Action {
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

function runtimeOf(journey: JourneyState): ExplorationSiteRuntime {
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

function req<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a fixture value");
  return value;
}

type Select = (offer: Offer) => object;
type Forge = (
  journey: JourneyState,
  offer: Offer,
  selection: object,
) => { journey?: JourneyState; payload?: object };

interface Case {
  name: string;
  primary: Action;
  essence?: number;
  select?: Select;
  effect: (before: JourneyState, after: JourneyState, offer: Offer) => void;
  forgeries: Record<string, Forge>;
}

const offerPatch =
  (patch: (offer: Offer) => Partial<Offer>): Forge =>
  (journey, offer) => ({ journey: withOffer(journey, patch(offer)) });
type JourneyChange = (journey: JourneyState, o: Offer) => Partial<JourneyState>;
const journeyPatch =
  (patch: JourneyChange): Forge =>
  (journey, offer) => ({ journey: { ...journey, ...patch(journey, offer) } });
const payload =
  (value: object): Forge =>
  () => ({ payload: value });

const multiCardSelection = (offer: Offer) => {
  const [a, b] = req(offer.multiCardTransfigurationPreparation).eligibleCards;
  const form = req(
    a?.transfigurations.find((f) => b?.transfigurations.includes(f)),
  );
  return {
    entryIds: [req(a).entryId, req(b).entryId],
    transfigurations: [form, form],
  };
};
const dreamsignSelection = (offer: Offer) => ({
  offeredDreamsignId: offer.dreamsignPreparation?.preparedDreamsignIds[0],
});
const siteChoice = (offer: Offer) =>
  req(offer.siteTypeChoicePreparation?.choices[1]);
const formOf = (journey: JourneyState, entryId: DeckEntryId) =>
  journey.deck.find((entry) => entry.entryId === entryId)?.transfiguration;
const forgedPlan = stableDigest("forged-plan");

const CASES: Case[] = [
  {
    name: "random Essence",
    primary: action("random-essence", {
      effectKind: "gain-random-essence",
      minimumEssence: 50,
      maximumEssence: 150,
    }),
    effect: (before, after, offer) => {
      expect(after.essence - before.essence).toBe(offer.preparedEssenceAmount);
    },
    forgeries: {
      "a forged amount": offerPatch((offer) => ({
        preparedEssenceAmount: req(offer.preparedEssenceAmount) + 1,
      })),
      "an unsupported protocol": payload({
        selectionRulesVersion: parseSelectionRulesVersion("unsupported"),
      }),
      "a missing protocol": payload({ selectionRulesVersion: undefined }),
      "an intent for a selection-free action": payload({
        selection: { cardIds: [] },
      }),
      "an unversioned runtime": (journey) => {
        const { selectionRulesVersion: _, ...runtime } = runtimeOf(journey);
        const siteRuntime = { [site.id]: runtime };
        return { journey: { ...journey, siteRuntime } as JourneyState };
      },
    },
  },
  {
    name: "a free-purchase counter",
    primary: action("free-purchases", {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 2,
    }),
    effect: (_, after) => {
      expect(after.essence).toBe(50);
      expect(after.shopModifiers.freePurchaseModifiers).toMatchObject([
        { sourceSiteId: site.id, initialCount: 2, remainingCount: 2 },
      ]);
    },
    forgeries: {
      "a field injected into the unsigned offer": offerPatch(() => ({
        preparedEssenceAmount: 1,
      })),
    },
  },
  {
    name: "bulk transfiguration",
    primary: action("transfigure-all", {
      effectKind: "transfigure-all-for-essence",
      canonicalMechanicId: "transfigure-deck-for-essence",
      essence: 100,
      predicate: "event",
      transfiguration: "Inspired",
    }),
    essence: 150,
    effect: (_, after, offer) => {
      const targets = req(offer.eligibleDeckEntryIds);
      expect(after.essence).toBe(50);
      expect(after.deck.map((e) => targets.includes(e.entryId))).toEqual(
        after.deck.map((e) => e.transfiguration === "Inspired"),
      );
    },
    forgeries: {
      "a forged target": offerPatch((offer) => ({
        eligibleDeckEntryIds: [
          ...req(offer.eligibleDeckEntryIds),
          parseDeckEntryId("entry-1"),
        ],
      })),
      "Essence below the cost": journeyPatch(() => ({ essence: 99 })),
    },
  },
  {
    name: "starter replacement",
    primary: action("starter-replace", {
      effectKind: "purge-random-starter-and-gain-card",
      predicate: "warrior",
    }),
    effect: (before, after, offer) => {
      const purged = req(offer.starterCardPreparation).purgedEntryIds;
      expect(after.deck).toHaveLength(before.deck.length);
      expect(after.deck.map(({ entryId }) => entryId)).not.toContain(purged[0]);
    },
    forgeries: {
      "a forged plan": offerPatch((offer) => ({
        starterCardPreparation: {
          ...req(offer.starterCardPreparation),
          planSignature: forgedPlan,
        },
      })),
      "a stale target": journeyPatch((journey, offer) => ({
        deck: journey.deck.map((entry) =>
          entry.entryId === offer.starterCardPreparation?.purgedEntryIds[0]
            ? { ...entry, cardNumber: 120 }
            : entry,
        ),
      })),
    },
  },
  {
    name: "multi-card transfiguration",
    primary: action("multi-card", {
      effectKind: "transfigure-selected",
      predicate: "character",
      count: 2,
    }),
    select: multiCardSelection,
    effect: (_, after, offer) => {
      const { entryIds, transfigurations } = multiCardSelection(offer);
      expect(entryIds.map((id) => formOf(after, id))).toEqual(transfigurations);
    },
    forgeries: {
      "an unoffered target": (_, offer) => {
        const { entryIds, transfigurations } = multiCardSelection(offer);
        const forged = { entryIds: [entryIds[0], "forged"], transfigurations };
        return { payload: { selection: forged } };
      },
    },
  },
  {
    name: "an offered card",
    primary: action("offered-card", {
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    }),
    select: (offer) => ({ cardIds: offer.offeredCardIds }),
    effect: (before, after) => {
      expect(after.deck).toHaveLength(before.deck.length + 1);
    },
    forgeries: {
      "an unoffered card": payload({
        selection: { cardIds: [SOURCE_CARD_ID] },
      }),
    },
  },
  {
    name: "Nightmares with a Dreamsign",
    primary: action("nightmare-dreamsign", {
      effectKind: "gain-nightmare-and-offered-dreamsign",
      offerCount: 3,
      nightmareCount: 2,
    }),
    select: dreamsignSelection,
    effect: (before, after, offer) => {
      const gained = after.deck.slice(before.deck.length);
      expect(gained.map((entry) => entry.cardNumber)).toEqual([2, 2]);
      expect(after.dreamsigns.map(({ id }) => id)).toEqual([
        dreamsignSelection(offer).offeredDreamsignId,
      ]);
    },
    forgeries: {
      "a stale Dreamsign pool": journeyPatch((journey) => ({
        remainingDreamsignPool: journey.remainingDreamsignPool.slice(1),
      })),
    },
  },
  {
    name: "a chosen site",
    primary: action("choose-site", {
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    }),
    select: (offer) => ({ siteType: siteChoice(offer).siteType }),
    effect: (_, after, offer) => {
      expect(after.atlas.nodes[NODE_ID]?.sites).toEqual([
        site,
        siteChoice(offer).insertedSite,
      ]);
    },
    forgeries: {
      "a forged plan": offerPatch((offer) => ({
        siteTypeChoicePreparation: {
          ...req(offer.siteTypeChoicePreparation),
          planSignature: forgedPlan,
        },
      })),
      "stale atlas topology": journeyPatch((journey) => {
        const late: SiteState = { ...site, id: parseSiteId("late") };
        const node = makeTestAtlasNode(NODE_ID, [site, late]);
        return { atlas: { ...journey.atlas, nodes: { [NODE_ID]: node } } };
      }),
    },
  },
];

describe("Exploration provider", () => {
  it.each(CASES)(
    "prepares $name from the seed, folds it once, and bounces forgeries",
    ({ primary, essence, select, effect, forgeries }) => {
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
    },
  );
});
