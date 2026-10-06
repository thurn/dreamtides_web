// Integration coverage for the real content providers behind the reducer
// seams. Unlike the per-case rules tests (which register minimal fakes), this
// suite registers the actual generators via `registerGameProviders(content)`
// and folds content-coupled event chains through the canonical engine config:
//   (a) each provider-backed event applies once the real providers are
//       registered; and
//   (b) folding the same log twice yields an identical final hash, so a
//       generator that leaked ambient randomness fails the determinism rail.
// Site ids and the avatar id are resolved from the folded state, and the
// assertions are over outcomes, hashes, and fixture-derived values.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameEvent, Genesis } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import type { SeqEvent } from "../../rules/replay/replay";
import { replayLog } from "../../rules/replay/replay";
import { genesisFoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { AvatarContent, DreamsignTemplate } from "../../types/content";
import type { GambleGameDefinition } from "../../types/gamble-data";
import type { JourneyState, SiteState, SiteType } from "../../types/journey";
import { parseCardName } from "../../types/card-identity";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  makeSyntheticAtlasData,
  MINIMAL_SITES_DATA,
  SYNTHETIC_ATLAS_DREAMSCAPES,
} from "../../testing/atlas-fixtures";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
  TEST_STARTER_CARD_NUMBERS,
} from "../../testing/pool-context";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { LayerName } from "../../types/layer-name";
import { buildAuguryContext } from "../../journey_v2/context/buildAuguryContext";
import { generateAuguryEncounter } from "../../journey_v2/encounter/generateAuguryEncounter";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestDreamsignTemplate,
  makeAuguryTestJourneyState,
  makeAuguryTestSite,
} from "../../journey_v2/testing/fixtures";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";
import { createSiteContentProvider } from "./site-provider";
import {
  parseAtlasNodeId,
  parseDeckEntryId,
  parseSiteId,
} from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testDreamscapeId,
  testDreamsignId,
  testEventActor,
  testExplorationActionId,
  testJourneySeed,
} from "../../types/test-identities";

const AVATAR_ID = testAvatarId("avatar-real-provider");
const TIMESTAMP = "1970-01-01T00:00:00.000Z";
const GENESIS: Genesis = {
  seed: testJourneySeed("real-provider-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};
const OPEN = { selectionRulesVersion: SELECTION_RULES_VERSION };

function makeCard(cardNumber: number, isStarter: boolean): CardData {
  return {
    name: parseCardName(`Card ${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDreamsignTemplates(count: number): DreamsignTemplate[] {
  return Array.from({ length: count }, (_value, index) =>
    makeAuguryTestDreamsignTemplate({
      id: testDreamsignId(`dreamsign-${String(index).padStart(3, "0")}`),
      name: `Dreamsign ${String(index)}`,
    }),
  );
}

const AVATAR: AvatarContent = {
  id: AVATAR_ID,
  name: "Provider Witness",
  title: "Provider Witness",
  renderedText: "Test ability.",
  imageNumber: "0006",
  startingEssence: 200,
};

/** Real journey-start, atlas, shop, and battle-init generators, no fetch. */
function makeJourneyContent(): JourneyContent {
  const dreamsignTemplates = makeDreamsignTemplates(8);
  const cards = [
    ...TEST_STARTER_CARD_NUMBERS.map((cardNumber) => makeCard(cardNumber, true)),
    ...buildTestCorpusCards(),
  ];
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((card) => [card.cardNumber, card])),
    avatars: [AVATAR],
    dreamwellCards: [],
    dreamsignTemplates,
    dreamscapes: SYNTHETIC_ATLAS_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: makeSyntheticAtlasData(),
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
    poolContext: makeTestPoolContext(dreamsignTemplates.map(({ id }) => id)),
  };
}

const CONTENT_SITE_TYPES: SiteType[] = [
  "Reward",
  "DreamsignRevelation",
  "Shop",
  "DreamsignBazaar",
  "Transfiguration",
  "Duplication",
  "Gamble",
];

/** A single-actor committed event: basedOnSeq = seq - 1. */
function ev(
  seq: number,
  type: SeqEvent["event"]["type"],
  payload: Record<string, unknown>,
): SeqEvent {
  return {
    seq,
    event: {
      type,
      payload,
      actor: testEventActor("p1"),
      clientTimestamp: TIMESTAMP,
      basedOnSeq: seq - 1,
    },
  };
}

const START: SeqEvent[] = [
  ev(1, "START_JOURNEY", { avatarId: AVATAR_ID }),
  ev(2, "SELECT_AVATAR", { avatarId: AVATAR_ID }),
];

function startedJourney(): JourneyState {
  return replayLog({ genesis: GENESIS, events: START }).finalState.journey;
}

function siteOf(label: string, type: SiteType, isEnhanced = false): SiteState {
  return { id: parseSiteId(label), type, isEnhanced, isVisited: false };
}

function expectAllApplied(outcomes: ReturnType<typeof replayLog>["outcomes"]) {
  for (const outcome of outcomes) {
    expect(
      outcome.outcome,
      `seq ${String(outcome.seq)} ${outcome.error?.message ?? ""}`,
    ).toBe("applied");
  }
}

describe("registerGameProviders (real content providers)", () => {
  beforeAll(() => {
    registerGameProviders(makeJourneyContent());
  });
  afterAll(() => {
    clearGameProviders();
  });

  it("applies OPEN_SITE for every content-coupled type and REROLL_SHOP, deterministically", () => {
    const started = replayLog({ genesis: GENESIS, events: START });
    const nodeId = started.finalState.journey.currentDreamscape;
    if (nodeId === null) throw new Error("expected a current dreamscape");

    let seq = START.length;
    const addSites = CONTENT_SITE_TYPES.map((siteType) =>
      ev(++seq, "ADD_SITE_TO_DREAMSCAPE", { nodeId, siteType }),
    );
    const withSites = replayLog({
      genesis: GENESIS,
      events: [...START, ...addSites],
    });
    const opened = new Map<SiteType, SiteId>();
    const visits: SeqEvent[] = [];
    for (const site of withSites.finalState.journey.atlas.nodes[nodeId].sites) {
      if (!CONTENT_SITE_TYPES.includes(site.type) || opened.has(site.type)) {
        continue;
      }
      opened.set(site.type, site.id);
      visits.push(
        ev(++seq, "ENTER_SITE", { siteId: site.id }),
        ev(++seq, "OPEN_SITE", { siteId: site.id, ...OPEN }),
      );
      if (site.type === "Shop" || site.type === "DreamsignBazaar") {
        visits.push(ev(++seq, "REROLL_SHOP", { siteId: site.id }));
      }
      visits.push(ev(++seq, "COMPLETE_SITE", { siteId: site.id }));
    }
    expect([...opened.keys()].sort()).toEqual([...CONTENT_SITE_TYPES].sort());

    const events = [...START, ...addSites, ...visits];
    const first = replayLog({ genesis: GENESIS, events });
    expectAllApplied(first.outcomes);
    const runtimeOf = (type: SiteType) => {
      const siteId = opened.get(type);
      return siteId === undefined
        ? undefined
        : first.finalState.journey.siteRuntime[siteId];
    };
    const bazaar = runtimeOf("DreamsignBazaar");
    expect(bazaar?.kind).toBe("shop");
    if (bazaar?.kind === "shop") {
      expect(bazaar.slots.length).toBeGreaterThan(0);
      expect(
        bazaar.slots.every(({ itemType }) => itemType === "dreamsign"),
      ).toBe(true);
    }
    expect(runtimeOf("Gamble")?.kind).toBe("gamble");

    expect(replayLog({ genesis: GENESIS, events }).finalHash).toBe(
      first.finalHash,
    );
  });

  it("includes the authored Dreamsign in the tutorial's opening Revelation offer", () => {
    const content = makeJourneyContent();
    const started = startedJourney();
    const { startingNodeId } = started.atlas;
    if (started.resolvedPackage === null || startingNodeId === null) {
      throw new Error("expected a started journey");
    }
    const poolIds = content.dreamsignTemplates.map(({ id }) => id);
    const requiredId = poolIds[poolIds.length - 1];
    // The authored offer applies only to the opening node's Revelation site.
    const revelation = siteOf("revelation", "DreamsignRevelation");
    const openingNode = started.atlas.nodes[startingNodeId];

    const result = createSiteContentProvider(content).openSite({
      journey: {
        ...started,
        atlas: {
          ...started.atlas,
          nodes: {
            ...started.atlas.nodes,
            [startingNodeId]: {
              ...openingNode,
              sites: [revelation, ...openingNode.sites],
            },
          },
        },
        isTutorialJourney: true,
        remainingDreamsignPool: poolIds,
        resolvedPackage: {
          ...started.resolvedPackage,
          dreamsignPoolIds: poolIds,
          openingDreamsignOfferIds: [requiredId],
        },
      },
      site: revelation,
      rng: () => 0,
      ...OPEN,
    });

    expect(result?.runtime.kind).toBe("dreamsignOffer");
    if (result?.runtime.kind !== "dreamsignOffer") return;
    expect(result.runtime.offeredDreamsigns.map(({ id }) => id)).toContain(
      requiredId,
    );
  });

  it("uses standard card pricing for enhanced Shop inventory and restocks", () => {
    const content = makeJourneyContent();
    const journey = startedJourney();
    const shop = siteOf("enhanced-shop", "Shop", true);
    const provider = createSiteContentProvider(content);
    const { cardSlots } = content.economyData.shop.stock.specialtyShop;
    const { standardCard } = content.economyData.shop.prices;

    const opened = provider.openSite({ journey, site: shop, rng: () => 0, ...OPEN });
    if (opened?.runtime.kind !== "shop") throw new Error("expected a shop");
    const rerolled = provider.rerollShop({
      journey: {
        ...journey,
        siteRuntime: { ...journey.siteRuntime, [shop.id]: opened.runtime },
      },
      site: shop,
      rng: () => 0.5,
    });

    for (const slots of [opened.runtime.slots, rerolled?.slots ?? []]) {
      const cards = slots.filter(({ itemType }) => itemType === "card");
      expect(cards).toHaveLength(cardSlots);
      expect(cards.every(({ basePrice }) => basePrice === standardCard)).toBe(
        true,
      );
    }
  });

  it("consumes the one-use modifier while minting transfigured Shop slots", () => {
    const modifier = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("exploration-action"),
    };

    const result = createSiteContentProvider(makeJourneyContent()).openSite({
      journey: { ...startedJourney(), siteOfferModifiers: [modifier] },
      site: siteOf("transfigured-shop", "Shop"),
      rng: () => 0,
      ...OPEN,
    });

    expect(result?.siteOfferModifiers).toEqual([]);
    expect(result?.runtime).toMatchObject({
      kind: "shop",
      transfiguredOfferSource: {
        siteId: modifier.sourceSiteId,
        actionId: modifier.sourceActionId,
      },
    });
    if (result?.runtime.kind !== "shop") return;
    const cards = result.runtime.slots.filter(
      (slot) => slot.itemType === "card",
    );
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(({ transfiguration }) => transfiguration !== undefined)).toBe(
      true,
    );
  });

  it("binds one queued free-shop modifier only to a Card Shop, never a Bazaar", () => {
    const started = startedJourney();
    const [firstModifier, secondModifier] = ["one", "two"].map((suffix) => ({
      kind: "free-next-shop" as const,
      sourceSiteId: parseSiteId(`exploration-${suffix}`),
      sourceActionId: testExplorationActionId(`action-${suffix}`),
    }));
    const journey: JourneyState = {
      ...started,
      shopModifiers: {
        ...started.shopModifiers,
        freeNextShopModifiers: [firstModifier, secondModifier],
      },
    };
    const provider = createSiteContentProvider(makeJourneyContent());

    const bazaar = provider.openSite({
      journey,
      site: siteOf("bazaar", "DreamsignBazaar"),
      rng: () => 0,
      ...OPEN,
    });
    expect(bazaar?.runtime).not.toHaveProperty("freePurchaseSource");
    expect(bazaar?.shopModifiers).toBeUndefined();

    const shop = provider.openSite({
      journey,
      site: siteOf("shop", "Shop"),
      rng: () => 0,
      ...OPEN,
    });
    expect(shop?.runtime).toMatchObject({
      kind: "shop",
      freePurchaseSource: {
        sourceSiteId: firstModifier.sourceSiteId,
        sourceActionId: firstModifier.sourceActionId,
      },
    });
    expect(shop?.shopModifiers?.freeNextShopModifiers).toEqual([secondModifier]);
    expect(shop?.shopModifiers?.freePurchaseModifiers).toEqual(
      journey.shopModifiers.freePurchaseModifiers,
    );
  });

  it("rebuilds debug progress as one consistent Atlas transition", () => {
    const result = replayLog({
      genesis: GENESIS,
      events: [START[0], ev(2, "REGENERATE_ATLAS", { completionLevel: 3 })],
    });
    expectAllApplied(result.outcomes);
    const { journey } = result.finalState;
    const nodes = Object.values(journey.atlas.nodes);

    expect(journey.completionLevel).toBe(3);
    expect(journey.screen.type).toBe("atlas");
    expect(nodes.filter(({ state }) => state === "completed")).toHaveLength(3);
    expect(
      nodes
        .filter(({ state }) => state === "available")
        .every(({ dreamscapeId }) => dreamscapeId !== null),
    ).toBe(true);
  });

  it("plays all seven layers through authoritative reducer events", () => {
    let state = genesisFoldState(GENESIS);
    let seq = 1;
    const apply = (
      type: GameEvent["type"],
      payload: Record<string, unknown>,
    ): void => {
      const result = reduceGameEvent(
        state,
        {
          type,
          payload,
          actor: testEventActor("p1"),
          clientTimestamp: TIMESTAMP,
          basedOnSeq: seq - 1,
        },
        {
          contentConfig: TEST_CONTENT_CONFIG,
          seq,
          timestamp: TIMESTAMP,
          rng: eventRng(GENESIS.seed, seq),
          intervening: [],
        },
      );
      expect(
        result.outcome,
        `seq ${String(seq)} ${type} ${
          result.outcome === "bounced" ? result.bounceReason : ""
        }`,
      ).toBe("applied");
      state = result.state;
      seq += 1;
    };

    apply("START_JOURNEY", { avatarId: AVATAR_ID });
    const layerCount = state.journey.atlas.layers.length;
    for (let layer = 0; layer < layerCount; layer += 1) {
      const nodeId = state.journey.currentDreamscape;
      if (nodeId === null) throw new Error("expected a current dreamscape");
      const node = state.journey.atlas.nodes[nodeId];
      for (const site of node.sites.filter(({ type }) => type !== "Battle")) {
        apply("ENTER_SITE", { siteId: site.id });
        apply("COMPLETE_SITE", { siteId: site.id });
      }
      const battle = node.sites.find(({ type }) => type === "Battle");
      apply("ENTER_SITE", { siteId: battle?.id });
      apply("BEGIN_BATTLE", { siteId: battle?.id });
      apply("BATTLE_COMMAND", { command: { id: "SKIP_TO_REWARDS" } });
      apply("END_BATTLE", {});

      expect(state.journey.atlas.nodes[nodeId].state).toBe("completed");
      expect(state.journey.completionLevel).toBe(layer + 1);
      if (layer < layerCount - 1) {
        const nextId = node.forwardIds.find(
          (id) => state.journey.atlas.nodes[id].state === "available",
        );
        if (nextId === undefined) throw new Error("expected a frontier");
        expect(state.journey.atlas.nodes[nextId].dreamscapeId).not.toBeNull();
        apply("TRAVEL_TO_DREAMSCAPE", { nodeId: nextId });
      }
    }

    expect(state.battle).toBeNull();
    expect(state.journey.screen.type).toBe("journeyComplete");
    for (const layer of state.journey.atlas.layers) {
      expect(
        layer.filter(
          (nodeId) => state.journey.atlas.nodes[nodeId].state === "completed",
        ),
      ).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic single-node fixture for Gamble and Augury resolution
// ---------------------------------------------------------------------------

const AUGURY_SEED = testJourneySeed("augury-real-provider-seed");
// LOAD_STATE requires the loaded snapshot's seed to equal the game seed.
const AUGURY_GENESIS: Genesis = { ...GENESIS, seed: AUGURY_SEED };
const AUGURY_SITE_ID = parseSiteId("site-augury-resolve");
const AUGURY_NODE_ID = parseAtlasNodeId("dreamscape-a");

function makeAuguryFixture(dreamsignCount = 10): {
  journey: JourneyState;
  content: JourneyContent;
  site: SiteState;
} {
  const site = makeAuguryTestSite({ id: AUGURY_SITE_ID, type: "Augury" });
  const cards = Array.from({ length: 30 }, (_value, index) => {
    const cardNumber = 1000 + index;
    return makeAuguryTestCard({
      id: testCardId(
        `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
      ),
      cardNumber,
      name: parseCardName(`Pool ${String(cardNumber)}`),
    });
  });
  const dreamsignTemplates = makeDreamsignTemplates(dreamsignCount);
  const content = makeAuguryTestContent({ cards, dreamsignTemplates });
  const journey = makeAuguryTestJourneyState({
    seed: AUGURY_SEED,
    currentDreamscape: AUGURY_NODE_ID,
    screen: { type: "site", siteId: site.id },
    remainingDreamsignPool: dreamsignTemplates.map(({ id }) => id),
    deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
      makeAuguryTestDeckEntry({
        entryId: parseDeckEntryId(`deck-${String(index + 1)}`),
        cardNumber,
      }),
    ),
    atlas: {
      nodes: {
        [AUGURY_NODE_ID]: {
          id: AUGURY_NODE_ID,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: testDreamscapeId("test_dreamscape"),
          sites: [site],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: AUGURY_NODE_ID,
      bossNodeId: AUGURY_NODE_ID,
      currentNodeId: AUGURY_NODE_ID,
      layers: [],
      knownDreamsignCarrierIds: [],
    },
  });
  return { journey, content, site };
}

/** The runtime field and fixture price a game charges at a standard or enhanced site. */
function expectedPrice(
  game: GambleGameDefinition,
  isEnhanced: boolean,
): Record<string, number> {
  const { economy } = game;
  switch (economy.kind) {
    case "threeGate":
    case "blackjack":
      return {
        wagerCost: isEnhanced ? economy.enhancedWager : economy.standardWager,
      };
    case "starwayStairs":
      return {
        wagerAmount: isEnhanced ? economy.enhancedWager : economy.standardWager,
      };
    case "fourSuitReprise":
      return {
        drawCost: isEnhanced
          ? economy.enhancedDrawPrice
          : economy.standardDrawPrice,
      };
    case "ladderClimb":
      return {};
  }
}

describe("createSiteContentProvider — Gamble", () => {
  const fixture = makeAuguryFixture();
  const provider = createSiteContentProvider(fixture.content);
  const { games } = fixture.content.gambleData;
  const gambleSite = makeAuguryTestSite({
    id: parseSiteId("gamble-site"),
    type: "Gamble",
  });

  it.each(games.map((game, index) => ({ game, index })))(
    "selects $game.id by weighted roll and prices it from the catalog",
    ({ game, index }) => {
      // Fixture games carry equal weight, so the roll at each bucket's midpoint
      // selects that game.
      const weighted = provider.openSite({
        journey: fixture.journey,
        site: gambleSite,
        rng: () => (index + 0.5) / games.length,
        ...OPEN,
      });
      expect(weighted?.runtime).toMatchObject({
        kind: "gamble",
        gameId: game.id,
        selectionTrace: { source: "weighted", selectedGameId: game.id },
        ...expectedPrice(game, false),
      });

      for (const isEnhanced of [false, true]) {
        const forced = provider.openSite({
          journey: fixture.journey,
          site: { ...gambleSite, isEnhanced },
          rng: () => 0.999,
          ...OPEN,
          gambleGameId: game.id,
        });
        expect(forced?.runtime).toMatchObject({
          kind: "gamble",
          gameId: game.id,
          selectionTrace: { source: "requested", requestedGameId: game.id },
          ...expectedPrice(game, isEnhanced),
        });
      }
    },
  );

  it("offers Four-Suit Reprise targets as distinct entries with free transfigurations", () => {
    const result = provider.openSite({
      journey: fixture.journey,
      site: gambleSite,
      rng: () => 0,
      ...OPEN,
      gambleGameId: "four-suit-reprise",
    });
    if (
      result?.runtime.kind !== "gamble" ||
      result.runtime.gameId !== "four-suit-reprise"
    ) {
      throw new Error("expected Four-Suit Reprise");
    }
    const { targets } = result.runtime;

    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets.map(({ entryId }) => entryId)).size).toBe(
      targets.length,
    );
    for (const target of targets) {
      for (const offer of target.transfigurationOffers) {
        expect(offer.essenceCost).toBe(0);
      }
    }
  });

  it("selects the Ladder Climb reward uniformly from its strong pool", () => {
    const wide = makeAuguryFixture(55);
    const ladder = games.find(({ rules }) => rules.kind === "ladderClimb");
    if (ladder?.rules.kind !== "ladderClimb") throw new Error("no ladder");

    const result = createSiteContentProvider(wide.content).openSite({
      journey: wide.journey,
      site: gambleSite,
      rng: () => 0.999,
      ...OPEN,
      gambleGameId: ladder.id,
    });
    if (
      result?.runtime.kind !== "gamble" ||
      result.runtime.gameId !== "tidemark-ladder-climb"
    ) {
      throw new Error("expected Ladder Climb");
    }
    const { strongPoolLimit } = ladder.rules;

    expect(result.runtime.dreamsignCandidateScores).toHaveLength(55);
    expect(result.runtime.strongPoolSize).toBe(strongPoolLimit);
    expect(result.runtime.rewardDreamsign?.id).toBe(
      result.runtime.dreamsignCandidateScores[strongPoolLimit - 1]?.dreamsignId,
    );
  });

  it("falls back to Three Gates when Ladder Climb cannot prepare a Dreamsign", () => {
    const result = provider.openSite({
      journey: { ...fixture.journey, remainingDreamsignPool: [] },
      site: gambleSite,
      rng: () => 0,
      ...OPEN,
      gambleGameId: "tidemark-ladder-climb",
    });

    expect(result?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "gravok-three-gate-wager",
      rewardDreamsign: null,
    });
  });
});

describe("registerGameProviders — augury resolution", () => {
  const fixture = makeAuguryFixture();
  const encounter = generateAuguryEncounter(
    buildAuguryContext({
      journeyState: fixture.journey,
      journeyContent: fixture.content,
      site: fixture.site,
    }),
  );
  const directOffer = encounter.offers.find(
    ({ applyPayload }) => applyPayload !== undefined,
  );

  beforeAll(() => {
    registerGameProviders(fixture.content);
  });
  afterAll(() => {
    clearGameProviders();
  });

  it.each([
    {
      type: "ACCEPT_AUGURY_OFFER" as const,
      payload: () => ({
        siteId: AUGURY_SITE_ID,
        encounterSignature: directOffer?.encounterSignature,
        offerId: directOffer?.offerId,
        archetypeId: directOffer?.archetypeId,
      }),
    },
    {
      type: "DECLINE_AUGURY" as const,
      payload: () => ({
        siteId: AUGURY_SITE_ID,
        encounterSignature: encounter.encounterSignature,
        offerId: encounter.offers[0]?.offerId,
      }),
    },
  ])("folds LOAD_STATE -> $type: applies, returns to the dreamscape, deterministic", ({ type, payload }) => {
    const events = [
      ev(1, "LOAD_STATE", { snapshot: fixture.journey }),
      ev(2, type, payload()),
    ];
    const first = replayLog({ genesis: AUGURY_GENESIS, events });

    expectAllApplied(first.outcomes);
    expect(first.finalState.journey.screen).toEqual({ type: "dreamscape" });
    expect(replayLog({ genesis: AUGURY_GENESIS, events }).finalHash).toBe(
      first.finalHash,
    );
  });

  it("mints a granted card's deck entry through the shared mintEntryId(deck, seq, index) scheme", () => {
    const mintJourney: JourneyState = {
      ...fixture.journey,
      siteRuntime: {
        ...fixture.journey.siteRuntime,
        [AUGURY_SITE_ID]: {
          kind: "augury",
          completed: false,
          forcedArchetypeId: "fit_card_draft",
        },
      },
    };
    const mintEncounter = generateAuguryEncounter(
      buildAuguryContext({
        journeyState: mintJourney,
        journeyContent: fixture.content,
        site: fixture.site,
      }),
    );
    const isCardGrant = (candidate: { applyPayload: { kind: string } }) =>
      candidate.applyPayload.kind === "add_catalog_card";
    const offer = mintEncounter.offers.find((o) =>
      o.choiceRequest?.candidates.some(isCardGrant),
    );
    const candidate = offer?.choiceRequest?.candidates.find(isCardGrant);
    if (offer === undefined || candidate === undefined) {
      throw new Error("expected a card-grant offer");
    }

    const result = replayLog({
      genesis: AUGURY_GENESIS,
      events: [
        ev(1, "LOAD_STATE", { snapshot: mintJourney }),
        ev(2, "ACCEPT_AUGURY_OFFER", {
          siteId: AUGURY_SITE_ID,
          encounterSignature: offer.encounterSignature,
          offerId: offer.offerId,
          archetypeId: offer.archetypeId,
          choice: { choiceId: candidate.choiceId },
        }),
      ],
    });
    expectAllApplied(result.outcomes);

    const before = new Set(mintJourney.deck.map(({ entryId }) => entryId));
    const minted = result.finalState.journey.deck.filter(
      ({ entryId }) => !before.has(entryId),
    );
    // Minted at the ACCEPT_AUGURY_OFFER event's own seq (2), index 0.
    expect(minted.map(({ entryId }) => entryId)).toEqual(["deck-2-0"]);
  });
});
